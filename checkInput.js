const { logError } = require('./log-fns');

const checkHash = (hash) => /^[0-9a-f]{40}$/.test(hash);

const checkDeployHash = (deployHash) => {
  if (deployHash && checkHash(deployHash)) {
    return deployHash;
  }

  logError('Deploy hash is not valid');
  process.exit(1);
};

const checkSkipHashesStr = (skipHashesStr, deployHash) => {
  // SKIP_HASHES sanitizing
  // skipHashesStr string is not empty
  if (skipHashesStr.length > 0) {
    // split skipHashesStr by commas
    const nextSkipHashes = skipHashesStr.split(',');
    if (
      // skipHashes array has at least one element
      nextSkipHashes.length > 0 &&
      // and no one is empty
      !nextSkipHashes.includes('') &&
      // and every one is a valid github commit hash
      nextSkipHashes.every(checkHash) &&
      // and no one is the target deployHash
      !nextSkipHashes.includes(deployHash)
    ) {
      return nextSkipHashes;
    }

    logError('Deploy to skip string not valid');
    process.exit(1);
  }

  return null;
};

const checkBranch = (branch) => {
  if (branch && ['test', 'demo'].includes(branch)) {
    return branch;
  }

  logError('Destination branch is not valid');
  process.exit(1);
};

const checkPat = (pat) => {
  if (pat) {
    return pat;
  }

  logError('Github Personal Access Token (PAT) is not valid');
  process.exit(1);
};

module.exports = {
  checkDeployHash,
  checkSkipHashesStr,
  checkBranch,
  checkPat,
};
