#!/bin/sh

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

LOCALES="ach af ak ar ast be bg bn-BD bn-IN br bs ca cs cy da de el en-GB     \
         en-ZA eo es-AR es-CL es-ES es-MX et eu fa ff fi fr fy-NL ga-IE gd gl \
         gu-IN he hi-IN hr hu hy-AM id is it ja ja-JP-mac kk kn ko ku lg lij  \
         lt lv mai mk ml mn mr my nb-NO nl nn-NO nso or pa-IN pl pt-BR pt-PT  \
         rm ro ru si sk sl son sq sr sv-SE ta ta-LK te th tr uk vi wo zh-CN   \
         zh-TW zu"

for LOCALE in $LOCALES
do
  DIR=src/locale/$LOCALE/
  FILE=$DIR/tabview.properties
  rm -fr $DIR; mkdir $DIR
  cp $(dirname $DIR)/tabview.properties $DIR

  URL=http://hg.mozilla.org/l10n-central/$LOCALE/raw-file/tip/browser/chrome/browser/tabview.properties
  curl -s $URL | grep -v sessionStore | grep -v '^#' >> $FILE

  echo >> $FILE

  URL=http://hg.mozilla.org/l10n-central/$LOCALE/raw-file/tip/browser/chrome/browser/browser.properties
  curl -s $URL | awk 'BEGIN {x=0} { if ($0~/^# TabView/) {x=1} if ($0~/^$/) {x=0} if (x==1) {print $0} }' >> $FILE

  echo -n .
done

echo
