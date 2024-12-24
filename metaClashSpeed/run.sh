#!/bin/zsh

source /home/pi/.zshrc
which node

export https_proxy=
export http_proxy=
export all_proxy=
export ALL_PROXY=

pkill -f "./bin/mihomo-pi"

#export NVM_DIR="/usr/local/.nvm"
#  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
#  [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

nvm use v22.11.0

#node -e "console.log('hello')"
#node --version

# npm works too!
#npm --version

cd /home/pi/server/metaClashSpeed
echo "hello"
# /usr/local/.nvm/versions/node/v23.3.0/bin/node /mnt/lingShan/dev/service/metaClashSpeed/main.js > ./ppt.log
node /home/pi/server/metaClashSpeed/main.js > ./task.log
