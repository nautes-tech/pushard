const core = require('@actions/core');
const simpleGit = require('simple-git');
const { spawnShellCommand } = require('./shellCommand');
const { logStartOp, logEndOp, logError } = require('./log-fns');

const gitClone = async ({ repo, dstDirectory, gitUsername, pass }) => {
  logStartOp(`clone itself - ${repo}`);
  const remote = `https://${gitUsername}:${pass}@${repo}`;
  await spawnShellCommand({
    cmd: 'git',
    args: ['clone', remote],
    cwd: dstDirectory,
  });
  logEndOp(`done`);
};

class Git {
  constructor(options) {
    const { amplifyProjectFolder, pass } = options;

    this.amplifyProjectFolder = amplifyProjectFolder;

    this.git = simpleGit({
      baseDir: this.amplifyProjectFolder,
      binary: 'git',
      maxConcurrentProcesses: 6,
      config: {
        'credential.https://github.com/.helper': `"! f() { echo username=x-access-token; echo password=${pass}; };f"`,
      },
    });
  }

  async logConfig() {
    const config = await this.git.listConfig();
    console.log('config1', JSON.stringify(config, null, 2));
  }

  async configureCommitter({ gitUsername, gitEmail }) {
    await this.git
      .addConfig('user.name', gitUsername)
      .addConfig('user.email', gitEmail)
      .addConfig('merge.ours.driver', 'true');
  }

  async changeWorkingDirectory(directory) {
    logStartOp(`change git working directory to ${directory}`);
    this.git.cwd(directory);
    logEndOp('done');
  }

  async fetch() {
    logStartOp(`git fetch`);
    await this.git.fetch();
    logEndOp(`done`);
  }

  async alignBranch(branch) {
    logStartOp(`align destination dir ${branch}`);
    try {
      await this.git.checkout(branch);
      await this.git.pull('origin', branch);
    } catch (e) {
      logError(e);
      core.setFailed(e);
      process.exit(1);
    }
    logEndOp(`done`);
  }

  async getLastDeployHashForBranch(branch) {
    logStartOp(`get last deploy hash from branch <${branch}>`);
    let startHash = await this.git.raw([
      'log',
      '-1',
      '--pretty=%B',
      `origin/${branch}`,
    ]);
    const startHashParts = startHash.split('🔀');
    if (startHashParts.length !== 3 || startHashParts[1] === '') {
      logError('wrong commit message');
      core.setFailed('wrong commit message');
      process.exit(1);
    }
    startHash = startHashParts[1];
    logEndOp(`${startHash}`);
    return startHash;
  }

  async getLastUsefulCommits({
    startHash,
    deployHash,
    isKeepingFirstMergeCommit,
    skipHashes,
  }) {
    logStartOp(
      `>>> rev-list origin/dev and cut from ${startHash} to ${deployHash}`
    );
    const branchHashes = await this.git.raw(['rev-list', 'origin/dev']);

    if (!branchHashes) {
      logError('no commits');
      core.setFailed('no commits');
      process.exit(0);
    }

    const revListRes = branchHashes.split('\n').filter((item) => !!item);
    const deployHashIdx = revListRes.indexOf(deployHash);
    let startHashIdx = revListRes.indexOf(startHash);
    if (deployHashIdx === -1 || startHashIdx === -1) {
      logError('cannot find startHash or deployHash');
      core.setFailed('cannot find startHash or deployHash');
      process.exit(1);
    }

    // let starthashIdxToUse = startHashIdx;
    // if (isKeepingFirstMergeCommit) {
    //   starthashIdxToUse += 1;
    //   if (deployHashIdx === startHash) {
    //     starthashIdxToUse += 1;
    //   }
    // }

    console.log(`isKeepingFirstMergeCommit: ${isKeepingFirstMergeCommit}`);
    const starthashIdxToUse = isKeepingFirstMergeCommit
      ? startHashIdx + 1
      : startHashIdx;

    console.log(`startHash: ${revListRes[starthashIdxToUse]}`);

    let lastCommits = revListRes
      .slice(deployHashIdx, starthashIdxToUse)
      .reverse();

    console.log(`${lastCommits.length} commit(s) to move`);
    if (skipHashes && skipHashes.length) {
      console.log(`${skipHashes.length} commit(s) to skip`);
      lastCommits = lastCommits.filter((item) => !skipHashes.includes(item));
    }

    core.startGroup(`${lastCommits.length} commit(s) to push`);
    console.log(JSON.stringify(lastCommits, null, 2));
    core.endGroup();

    if (!lastCommits.length) {
      console.info('\nno push to execute, exit');
      process.exit(0);
    }

    return lastCommits;
  }

  async tryMerge(hash, branch) {
    logStartOp(`merge all files from ${hash} to ${branch} strategy: theirs`);
    await spawnShellCommand({
      cmd: `git`,
      args: [
        'merge',
        hash,
        '--strategy-option=theirs',
        '-m',
        `Merge commit 🔀${hash}🔀`,
        '--allow-unrelated-histories',
      ],
      cwd: this.amplifyProjectFolder,
    });
    logEndOp('done');
  }

  async mergeAbort() {
    logStartOp('GIT merge abort');
    const mergeAbortRes = await this.git.merge({ '--abort': null });

    if (mergeAbortRes.result !== 'success') {
      core.setFailed('error during [git merge --abort]');
      process.exit(1);
    }
    logEndOp('done');
  }

  async push(branch) {
    logStartOp('GIT push');
    const pushRes = await this.git.push('origin', branch).catch((e) => {
      core.setFailed(e);
      process.exit(1);
    });
    logEndOp(JSON.stringify(pushRes, null, 2));
  }

  async checkoutOriginalVersionOfFile(filename) {
    logStartOp(`checkout HEAD ${filename} to restore my version`);
    await this.git.raw(['checkout', 'HEAD', filename]);
    logEndOp(`done`);
  }

  async addAllAndCommit(message) {
    logStartOp('GIT add and commit');
    await spawnShellCommand({
      cmd: `git`,
      args: ['add', './'],
      cwd: this.amplifyProjectFolder,
    });
    const commitRes = await this.git.commit({
      '-m': true,
      [message]: true,
      // '--author': 'aps script',
    });
    logEndOp(JSON.stringify(commitRes, null, 2));
  }

  async checkoutCurrentBranchHead() {
    logStartOp(`checkout HEAD to restore my version`);
    await this.git.raw(['checkout', 'HEAD']);
    logEndOp(`done`);
  }

  async getLastCommitMessageForBranch(branch) {
    logStartOp(`get last commit message for branch ${branch}`);
    const commitMessage = await this.git.raw([
      'log',
      '-1',
      '--pretty=%B',
      `origin/${branch}`,
    ]);
    logEndOp(commitMessage);
    return commitMessage;
  }
}

module.exports = { Git, gitClone };
