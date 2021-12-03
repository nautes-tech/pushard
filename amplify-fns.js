const { spawnShellCommand, execShellCommand } = require('./shellCommand');
const { logStartOp, logEndOp, logError } = require('./log-fns');
require('dotenv').config();

const chmodScripts = async () => {
  logStartOp('chmod +x shell scripts');
  console.log('platform', process.platform);

  if (process.platform !== 'win32') {
    await spawnShellCommand({
      cmd: `chmod`,
      args: ['+x', 'amplify-init.sh'],
    });
    logEndOp(`done CHMOD amplify-init.sh`);

    await spawnShellCommand({
      cmd: `chmod`,
      args: ['+x', 'amplify-pull.sh'],
    });
    logEndOp(`done CHMOD amplify-pull.sh`);

    await spawnShellCommand({
      cmd: `chmod`,
      args: ['+x', 'amplify-push.sh'],
    });
  }
  logEndOp(`done CHMOD amplify-push.sh`);
};

const init = async (
  env,
  amplifyProjectFolder,
  amplifyAppId,
  amplifyProjectName
) => {
  logStartOp(`amplify INIT ${env} of appId: ${process.env.APP_ID} `);
  const isInitErr = await spawnShellCommand({
    cmd: './amplify-init.sh',
    args: [
      env,
      amplifyAppId,
      process.env.AWS_ACCESS_KEY_ID,
      process.env.AWS_SECRET_ACCESS_KEY,
      amplifyProjectName,
      amplifyProjectFolder,
    ],
  });

  if (isInitErr) {
    logError(`FAIL - amplify INIT`);
    return isInitErr;
  }
  logEndOp(`done`);
};

const pull = async (
  env,
  amplifyProjectFolder,
  amplifyAppId,
  amplifyProjectName
) => {
  logStartOp('amplify PULL');
  const isPullErr = await spawnShellCommand({
    cmd: './amplify-pull.sh',
    args: [
      env,
      amplifyAppId,
      process.env.AWS_ACCESS_KEY_ID,
      process.env.AWS_SECRET_ACCESS_KEY,
      amplifyProjectName,
      amplifyProjectFolder,
    ],
  });

  if (isPullErr) {
    logError(`amplify PULL failed`);
    process.exit(1);
  }
  logEndOp(`done`);
};

const push = async (amplifyProjectFolder, currentHash) => {
  logStartOp('amplify PUSH');
  const isPushErr = await spawnShellCommand({
    cmd: './amplify-push.sh',
    args: [amplifyProjectFolder],
  });

  if (isPushErr) {
    logError(`FAIL - amplify PUSH`);
    process.exit(1);
  }
  logEndOp(`push ${currentHash} is done`);
};

const configure = async (awsRegion) => {
  logStartOp('aws cli configuration');
  const setValue = async (varname, value) =>
    await spawnShellCommand({
      cmd: `aws`,
      args: ['configure', 'set', varname, value],
    });

  setValue('aws_access_key_id', process.env.AWS_ACCESS_KEY_ID);
  setValue('aws_secret_access_key', process.env.AWS_SECRET_ACCESS_KEY);
  setValue('default.region', awsRegion);
  process.env.AWS_PROFILE &&
    setValue(`profile.${process.env.AWS_PROFILE}.region`, awsRegion);

  logEndOp('done');
};

const wait = async (stackName) => {
  logStartOp('wait for stack to finish');
  try {
    await spawnShellCommand({
      cmd: `aws`,
      args: [
        '--profile',
        process.env.AWS_PROFILE,
        'cloudformation',
        'wait',
        'stack-update-complete',
        '--stack-name',
        stackName,
      ],
    });

    logEndOp(`CloudFormation stack is complete`);
  } catch (e) {
    logError(`aws wait error - ${e}`);
  }
};

const getStackStatus = async (stackName) => {
  logStartOp('get stack status');
  try {
    const stackStatus = await execShellCommand({
      cmd: `aws`,
      args: [
        '--profile',
        process.env.AWS_PROFILE,
        'cloudformation',
        'describe-stacks',
        '--stack-name',
        stackName,
        '--query',
        'Stacks[].StackStatus',
      ],
    });

    logEndOp(`stack status: ${stackStatus}`);
    return stackStatus;
  } catch (e) {
    logError(`aws get stack status error - ${e}`);
  }
};

module.exports = {
  chmodScripts,
  init,
  pull,
  push,
  configure,
  wait,
  getStackStatus,
};
