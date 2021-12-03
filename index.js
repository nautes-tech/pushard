require('dotenv').config();
const { readFileSync } = require('fs');
const core = require('@actions/core');
const { Git, gitClone } = require('./git-fns');
const notification = require('./notification');

const {
  checkDeployHash,
  checkSkipHashesStr,
  checkBranch,
  checkPat,
} = require('./checkInput');
const { logStartOp, logEndOp, logError } = require('./log-fns');
const amplify = require('./amplify-fns');

/**
 * GET ENV VARIABLES
 */

const gitCloneRepo = process.env.AMPLIFY_PROJECT_REPO;
const gitCloneFolder = '../pushard_temp_dir';
const projectFolder = gitCloneRepo.split('/').pop();
const amplifyProjectFolder = `${gitCloneFolder}/${projectFolder}`;
const amplifyTeamProviderPath = `${amplifyProjectFolder}/amplify/team-provider-info.json`;
const amplifyProjectConfig = `${amplifyProjectFolder}/amplify/.config/project-config.json`;

const deployHash = checkDeployHash(process.env.DEPLOY_HASH);
const skipHashes = checkSkipHashesStr(process.env.SKIP_HASHES, deployHash);
const dstBranch = checkBranch(process.env.DST_BRANCH);
const ghUsername = checkPat(process.env.GH_USERNAME);
const ghPat = checkPat(process.env.GH_USER_PAT);

core.info('NODE_ENV', process.env.NODE_ENV);

if (!deployHash || !dstBranch || !ghPat) {
  throw new Error('no data');
}

const dstEnv = dstBranch;

logStartOp(` ==> Deploy commit hash ${deployHash} to ${dstBranch} <==`);

const main = async () => {
  await gitClone({
    repo: gitCloneRepo,
    dstDirectory: gitCloneFolder,
    gitUsername: ghUsername,
    pass: ghPat,
  });

  const options = { amplifyProjectFolder, pass: ghPat };
  const git = new Git(options);

  await git.configureCommitter({
    gitUsername: 'PUSHARD',
    gitEmail: 'pushard@github.com',
  });

  await git.changeWorkingDirectory(amplifyProjectFolder);

  await git.fetch();

  await git.alignBranch(dstBranch);

  const startHash = await git.getLastDeployHashForBranch(dstBranch);

  const lastCommitMessage = await git.getLastCommitMessageForBranch(dstBranch);
  console.log(`last commit message: ${lastCommitMessage}`);

  const isLastCommitMerge = lastCommitMessage.includes('Merge');

  const lastCommits = await git.getLastUsefulCommits({
    startHash,
    deployHash,
    isKeepingFirstMergeCommit: isLastCommitMerge,
    skipHashes,
  });

  await amplify.chmodScripts();

  logStartOp(`read ${dstBranch} cloudformation StackId, AppId, Region`);
  const teamProviderTxt = readFileSync(amplifyTeamProviderPath, 'utf8');
  const teamProvider = JSON.parse(teamProviderTxt);
  const {
    StackId: stackName,
    AmplifyAppId: amplifyAppId,
    Region: awsRegion,
  } = teamProvider[dstBranch]?.awscloudformation;
  logEndOp(`StackId: ${stackName}`);

  logStartOp(`read ${dstBranch} project-config.json`);
  const projectConfigTxt = readFileSync(amplifyProjectConfig, 'utf8');
  const projectConfig = JSON.parse(projectConfigTxt);
  const { projectName: amplifyProjectName } = projectConfig;
  logEndOp(`StackId: ${stackName}`);

  await amplify.configure(awsRegion);

  await amplify.pull(
    dstEnv,
    amplifyProjectFolder,
    amplifyAppId,
    amplifyProjectName
  );

  notification.sendMessage(
    `🟢 START deploying \`${deployHash}\` to \`${dstBranch}\` - ${lastCommits.length} push`
  );

  core.info('\n|---- INIT PUSH LOOP ----|');

  let commitCounter = 0;

  await git.addAllAndCommit(`🔀${startHash}🔀`);

  for (const currentHash of lastCommits) {
    const message = `loop nr. ${++commitCounter} of ${lastCommits.length}`;
    core.startGroup(message);
    notification.sendMessage(message);

    try {
      if (currentHash === startHash && isLastCommitMerge) {
        // skip first commit if it is a merge commit
      } else {
        await git.tryMerge(currentHash, dstBranch);

        await git.checkoutOriginalVersionOfFile(
          'amplify/team-provider-info.json'
        );
      }

      const isInitErr = await amplify.init(
        dstEnv,
        amplifyProjectFolder,
        amplifyAppId,
        amplifyProjectName
      );

      if (isInitErr) {
        logError('>> I will try to abort the merge and push');
        git.mergeAbort();
        git.push(dstBranch);
        core.setFailed('amplify init error');
        process.exit(1);
      }

      // first thing: do push
      // error ? status === _IN_PROGRESS ? retry : error

      let retryLeft = 3;
      let shouldTryToPush = true;
      while (shouldTryToPush && retryLeft >= 0) {
        try {
          await amplify.push(amplifyProjectFolder, currentHash);
          shouldTryToPush = false;
        } catch (e) {
          const stackStatus = await amplify.getStackStatus(stackName);
          console.log(`stackStatus: ${stackStatus}`);
          if (stackStatus.includes('_IN_PROGRESS')) {
            logStartOp('stack is in progress, waiting...');
            await amplify.wait(stackName);
            const catchmessage = `⚠️ stack operation complete, ${retryLeft} retry(es) left`;
            logEndOp(catchmessage);
            notification.sendMessage(catchmessage);
            retryLeft -= 1;
          } else {
            throw e;
          }
        }
      }
    } catch (e) {
      logError('CATCH ERROR DURING LOOP');
      logError(e.message);
      core.setFailed(e);
      notification.sendMessage(`🟥  ERROR - ${e.message}`);
      logError('I will now try to push any pending change');
      await git.checkoutCurrentBranchHead();
      logStartOp('GIT EMERGENCY PUSH');
      await git.push(dstBranch);
      process.exit(1);
    }

    await git.addAllAndCommit(`🔀${currentHash}🔀`);
  }

  logStartOp('GIT push');
  await git.push(dstBranch);
  notification.sendMessage('🏁 FINISH 🏁');
};

main();
