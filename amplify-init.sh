#!/bin/bash
set -e
IFS='|'

REACTCONFIG="{\
\"SourceDir\":\"src\",\
\"DistributionDir\":\"build\",\
\"BuildCommand\":\"npm run-script build\",\
\"StartCommand\":\"npm run-script start\"\
}"
AWSCLOUDFORMATIONCONFIG="{\
\"configLevel\":\"project\",\
\"useProfile\":false,\
\"accessKeyId\":\""$3\"",\
\"secretAccessKey\":\""$4\"",\
\"region\":\"eu-west-1\"\
}"
AMPLIFY="{\
\"projectName\":\""$5\"",\
\"appId\":\""$2\"",\
\"envName\":\""$1\"",\
\"defaultEditor\":\"code\"\
}"
FRONTEND="{\
\"frontend\":\"javascript\",\
\"framework\":\"react\",\
\"config\":$REACTCONFIG\
}"
PROVIDERS="{\
\"awscloudformation\":$AWSCLOUDFORMATIONCONFIG\
}"

cd $6

pwd

amplify init \
--amplify $AMPLIFY \
--frontend $FRONTEND \
--providers $PROVIDERS \
--yes
