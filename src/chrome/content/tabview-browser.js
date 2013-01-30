/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let TabView = {
  _deck: null,
  _iframe: null,
  _window: null,
  _initialized: false,
  _browserKeyHandlerInitialized: false,
  _closedLastVisibleTabBeforeFrameInitialized: false,
  _isFrameLoading: false,
  _initFrameCallbacks: [],
  GROUPS_IDENTIFIER: "tabview-groups",
  VISIBILITY_IDENTIFIER: "tabview-visibility",

  // ----------
  get windowTitle() {
    delete this.windowTitle;
    let brandBundle = document.getElementById("bundle_brand");
    let brandShortName = brandBundle.getString("brandShortName");
    let title = this._bundle.formatStringFromName("tabview.title", [brandShortName], 1);
    return this.windowTitle = title;
  },

  // ----------
  init: function TabView_init() {
    // disable the ToggleTabView command for popup windows
    goSetCommandEnabled("Browser:ToggleTabView", window.toolbar.visible);
    if (!window.toolbar.visible)
      return;

    if (this._initialized)
      return;

    // ___ visibility
    let sessionstore =
      Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);

    let data = sessionstore.getWindowValue(window, this.VISIBILITY_IDENTIFIER);
    if (data && data == "true") {
      this.show();
    } else {
      try {
        data = sessionstore.getWindowValue(window, this.GROUPS_IDENTIFIER);
        if (data) {
          let parsedData = JSON.parse(data);
          this.updateGroupNumberBroadcaster(parsedData.totalNumber || 1);
        }
      } catch (e) { }

      gBrowser.tabContainer.addEventListener("TabShow", this);
      gBrowser.tabContainer.addEventListener("TabClose", this);

     if (this._tabBrowserHasHiddenTabs()) {
       this._setBrowserKeyHandlers();
     } else {
       // for restoring last session and undoing recently closed window
       window.addEventListener("SSWindowStateReady", this);
      }
    }

    let ctxMenu = document.getElementById("tabContextMenu");
    ctxMenu.addEventListener("popupshowing", this);

    window.addEventListener("SSRestoreIntoWindow", this);
    window.addEventListener("WindowIsClosing", this);
    window.addEventListener("unload", this);

    this._initialized = true;
  },

  handleEvent: function TabView_handleEvent(event) {
    switch (event.type) {
      case "TabShow":
        if (!this._window) {
          // if a tab is changed from hidden to unhidden and the iframe is not
          // initialized, load the iframe and setup the tab.
          this._initFrame(function() {
            this._window.UI.onTabSelect(gBrowser.selectedTab);
            if (this._closedLastVisibleTabBeforeFrameInitialized) {
              this._closedLastVisibleTabBeforeFrameInitialized = false;
              this._window.UI.showTabView(false);
            }
          }.bind(this));
        }
        break;
      case "TabClose":
        if (!this._window && gBrowser.visibleTabs.length == 0)
          this._closedLastVisibleTabBeforeFrameInitialized = true;
        break;
      case "SSWindowStateReady":
        if (this._tabBrowserHasHiddenTabs())
          this._setBrowserKeyHandlers();
        break;
      case "SSRestoreIntoWindow":
        if (this._tabBrowserHasHiddenTabs())
          event.preventDefault();
        break;
      case "WindowIsClosing":
        if (this.isVisible()) {
          event.preventDefault();
          this.hide();
        }
        break;
      case "popupshowing":
        // Hide "Move to Group" if it's a pinned tab.
        document.getElementById("context_tabViewMenu").hidden =
          TabContextMenu.contextTab.pinned;
        break;
      case "unload":
        this.uninit();
        break;
    }
  },

  // ----------
  // Uninitializes TabView.
  uninit: function TabView_uninit() {
    if (!this._initialized)
      return;

    let ctxMenu = document.getElementById("tabContextMenu");
    ctxMenu.removeEventListener("popupshowing", this);

    gBrowser.tabContainer.removeEventListener("TabShow", this);
    gBrowser.tabContainer.removeEventListener("TabClose", this);

    window.removeEventListener("SSRestoreIntoWindow", this);
    window.removeEventListener("SSWindowStateReady", this);
    window.removeEventListener("WindowIsClosing", this);
    window.removeEventListener("unload", this);

    this._initialized = false;
  },

  // ----------
  // Creates the frame and calls the callback once it's loaded. 
  // If the frame already exists, calls the callback immediately. 
  _initFrame: function TabView__initFrame(callback) {
    let hasCallback = typeof callback == "function";

    // prevent frame to be initialized for popup windows
    if (!window.toolbar.visible)
      return;

    if (this._window) {
      if (hasCallback)
        callback();
      return;
    }

    if (hasCallback)
      this._initFrameCallbacks.push(callback);

    if (this._isFrameLoading)
      return;

    this._isFrameLoading = true;

    // ___ find the deck
    this._deck = document.getElementById("tab-view-deck");

    // ___ create the frame
    this._iframe = document.createElement("iframe");
    this._iframe.id = "tab-view";
    this._iframe.setAttribute("transparent", "true");
    this._iframe.setAttribute("tooltip", "tab-view-tooltip");
    this._iframe.flex = 1;

    let self = this;

    window.addEventListener("tabviewframeinitialized", function onInit() {
      window.removeEventListener("tabviewframeinitialized", onInit);

      self._isFrameLoading = false;
      self._window = self._iframe.contentWindow;
      self._setBrowserKeyHandlers();

      gBrowser.tabContainer.removeEventListener("TabShow", self);
      gBrowser.tabContainer.removeEventListener("TabClose", self);
      window.removeEventListener("SSWindowStateReady", self);
      self._initFrameCallbacks.forEach(function (cb) cb());
      self._initFrameCallbacks = [];
    });

    this._iframe.setAttribute("src", "chrome://tabgroups/content/tabview.html");
    this._deck.appendChild(this._iframe);

    // ___ create tooltip
    let tooltip = document.createElement("tooltip");
    tooltip.id = "tab-view-tooltip";
    tooltip.setAttribute("onpopupshowing", "return TabView.fillInTooltip(document.tooltipNode);");
    document.getElementById("mainPopupSet").appendChild(tooltip);
  },

  // ----------
  getContentWindow: function TabView_getContentWindow() {
    return this._window;
  },

  // ----------
  isVisible: function TabView_isVisible() {
    return (this._deck ? this._deck.selectedPanel == this._iframe : false);
  },

  // ----------
  show: function TabView_show() {
    if (this.isVisible())
      return;

    let self = this;
    this._initFrame(function() {
      self._window.UI.showTabView(true);
    });
  },

  // ----------
  hide: function TabView_hide() {
    if (!this.isVisible())
      return;

    this._window.UI.exit();
  },

  // ----------
  toggle: function TabView_toggle() {
    if (this.isVisible())
      this.hide();
    else 
      this.show();
  },

  // ----------
  _tabBrowserHasHiddenTabs: function TabView_tabBrowserHasHiddenTabs() {
    return (gBrowser.tabs.length - gBrowser.visibleTabs.length) > 0;
  },

  // ----------
  updateContextMenu: function TabView_updateContextMenu(tab, popup) {
    let separator = document.getElementById("context_tabViewNamedGroups");
    let isEmpty = true;

    while (popup.firstChild && popup.firstChild != separator)
      popup.removeChild(popup.firstChild);

    let self = this;
    this._initFrame(function() {
      let activeGroup = tab._tabViewTabItem.parent;
      let groupItems = self._window.GroupItems.groupItems;

      groupItems.forEach(function(groupItem) {
        // if group has title, it's not hidden and there is no active group or
        // the active group id doesn't match the group id, a group menu item
        // would be added.
        if (!groupItem.hidden &&
            (groupItem.getTitle().trim() || groupItem.getChildren().length) &&
            (!activeGroup || activeGroup.id != groupItem.id)) {
          let menuItem = self._createGroupMenuItem(groupItem);
          popup.insertBefore(menuItem, separator);
          isEmpty = false;
        }
      });
      separator.hidden = isEmpty;
    });
  },

  // ----------
  _createGroupMenuItem: function TabView__createGroupMenuItem(groupItem) {
    let menuItem = document.createElement("menuitem");
    let title = groupItem.getTitle();

    if (!title.trim()) {
      let topChildLabel = groupItem.getTopChild().tab.label;
      let childNum = groupItem.getChildren().length;

      if (childNum > 1) {
        let num = childNum - 1;
        title = this._bundle.GetStringFromName("tabview.moveToUnnamedGroup.label");
        title = PluralForm.get(num, title).replace("#1", topChildLabel).replace("#2", num);
      } else {
        title = topChildLabel;
      }
    }

    menuItem.setAttribute("label", title);
    menuItem.setAttribute("tooltiptext", title);
    menuItem.setAttribute("crop", "center");
    menuItem.setAttribute("class", "tabview-menuitem");
    menuItem.setAttribute(
      "oncommand",
      "TabView.moveTabTo(TabContextMenu.contextTab,'" + groupItem.id + "')");

    return menuItem;
  },

  // ----------
  moveTabTo: function TabView_moveTabTo(tab, groupItemId) {
    if (this._window) {
      this._window.GroupItems.moveTabToGroupItem(tab, groupItemId);
    } else {
      let self = this;
      this._initFrame(function() {
        self._window.GroupItems.moveTabToGroupItem(tab, groupItemId);
      });
    }
  },

  // ----------
  // Adds new key commands to the browser, for invoking the Tab Candy UI
  // and for switching between groups of tabs when outside of the Tab Candy UI.
  _setBrowserKeyHandlers: function TabView__setBrowserKeyHandlers() {
    if (this._browserKeyHandlerInitialized)
      return;

    this._browserKeyHandlerInitialized = true;

    let self = this;
    window.addEventListener("keypress", function(event) {
      if (self.isVisible() || !self._tabBrowserHasHiddenTabs())
        return;

      let charCode = event.charCode;
      // Control (+ Shift) + `
      if (event.ctrlKey && !event.metaKey && !event.altKey &&
          (charCode == 96 || charCode == 126)) {
        event.stopPropagation();
        event.preventDefault();

        self._initFrame(function() {
          let groupItems = self._window.GroupItems;
          let tabItem = groupItems.getNextGroupItemTab(event.shiftKey);
          if (!tabItem)
            return;

          if (gBrowser.selectedTab.pinned)
            groupItems.updateActiveGroupItemAndTabBar(tabItem, {dontSetActiveTabInGroup: true});
          else
            gBrowser.selectedTab = tabItem.tab;
        });
      }
    }, true);
  },

  // ----------
  // On move to group pop showing.
  moveToGroupPopupShowing: function TabView_moveToGroupPopupShowing(event) {
    // Update the context menu only if Panorama was already initialized or if
    // there are hidden tabs.
    let numHiddenTabs = gBrowser.tabs.length - gBrowser.visibleTabs.length;
    if (this._window || numHiddenTabs > 0)
      this.updateContextMenu(TabContextMenu.contextTab, event.target);
  },

  // ----------
  // Function: _addToolbarButton
  // Adds the TabView button to the TabsToolbar.
  _addToolbarButton: function TabView__addToolbarButton() {
    let buttonId = "tabview-button";

    if (document.getElementById(buttonId))
      return;

    let toolbar = document.getElementById("TabsToolbar");
    let currentSet = toolbar.currentSet.split(",");

    let alltabsPos = currentSet.indexOf("alltabs-button");
    if (-1 == alltabsPos)
      return;

    currentSet[alltabsPos] += "," + buttonId;
    currentSet = currentSet.join(",");
    toolbar.currentSet = currentSet;
    toolbar.setAttribute("currentset", currentSet);
    document.persist(toolbar.id, "currentset");
  },

  // ----------
  // Function: updateGroupNumberBroadcaster
  // Updates the group number broadcaster.
  updateGroupNumberBroadcaster: function TabView_updateGroupNumberBroadcaster(number) {
    let groupsNumber = document.getElementById("tabviewGroupsNumber");
    groupsNumber.setAttribute("groups", number);
  },

  // ----------
  // Function: fillInTooltip
  // Fills in the tooltip text.
  fillInTooltip: function fillInTooltip(tipElement) {
    let retVal = false;
    let titleText = null;
    let direction = tipElement.ownerDocument.dir;

    while (!titleText && tipElement) {
      if (tipElement.nodeType == Node.ELEMENT_NODE)
        titleText = tipElement.getAttribute("title");
      tipElement = tipElement.parentNode;
    }
    let tipNode = document.getElementById("tab-view-tooltip");
    tipNode.style.direction = direction;

    if (titleText) {
      tipNode.setAttribute("label", titleText);
      retVal = true;
    }

    return retVal;
  }
};

XPCOMUtils.defineLazyGetter(TabView, "_bundle", function() {
  return Services.strings.
    createBundle("chrome://tabgroups/locale/tabview.properties");
});

// Initialize TabView after the browser startup has finished.
Services.obs.addObserver(function observe(aSubject, aTopic, aData) {
  Services.obs.removeObserver(observe, aTopic);
  TabView.init();
}, "browser-delayed-startup-finished", false);
