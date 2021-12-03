const core = require('@actions/core');
const chalk = require('chalk');

const log = (text, tabNr = 0, color, action) => {
  const tabs = [...Array(tabNr)].map(() => '\t').join('');
  const colorTxt = chalk[color].bold(text);
  core[action](`${tabs}${colorTxt}`);
};

const logStartOp = (text) => log(`\n[ ${text} ]`, 0, 'cyan', 'info');
const logEndOp = (text) => log(`\t...${text}`, 1, 'cyan', 'info');
const logError = (text) => log(`\n[Error: ${text}]`, 0, 'red', 'error');

module.exports = {
  logStartOp,
  logEndOp,
  logError,
};
