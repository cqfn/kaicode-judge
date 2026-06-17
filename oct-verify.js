/**
 * oct-verify.js
 *
 * Minimal sample that verifies Octokit can reach the GitHub REST API
 * by requesting a single repository.
 *
 * Usage:
 *   node oct-verify.js [owner] [repo]
 *
 * Environment variables:
 *   GITHUB_TOKEN - optional personal access token for authenticated requests
 *
 * Example:
 *   GITHUB_TOKEN=ghp_xxx node oct-verify.js octocat Hello-World
 */

// Node 25+ removed Buffer.SlowBuffer; this polyfill is required by older
// transitive dependencies that Octokit 3.x brings in (buffer-equal-constant-time).
require('./fix-slowbuffer.js');

const { Octokit } = require('octokit');

async function verifyOctokit(owner, repo) {
  const token = process.env.GITHUB_TOKEN;

  const octokit = new Octokit({
    auth: token,
    log: undefined, // keep output silent
  });

  console.log(`Requesting repository: ${owner}/${repo} ...`);

  // const { data: repository } = await octokit.rest.repos.get({
  //   owner,
  //   repo,
  // });

  const rsp = await octokit.request('GET https://api.github.com/repos/' + owner + '/' + repo)

  console.log('data: ', rsp.status)

  console.log('Verification succeeded.');
  console.log('  full_name:', rsp.full_name);
  console.log('  id:', rsp.id);
  console.log('  private:', rsp.private);
  console.log('  default_branch:', rsp.default_branch);

  return repository;
}

async function main() {
  const owner = process.argv[2] || process.env.OWNER || 'octocat';
  const repo = process.argv[3] || process.env.REPO || 'Hello-World';

  try {
    await verifyOctokit(owner, repo);
  } catch (error) {
    console.error('Verification failed.');
    if (error.status) {
      console.error(`  HTTP status: ${error.status}`);
    }
    if (error.message) {
      console.error(`  message: ${error.message}`);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { verifyOctokit };
