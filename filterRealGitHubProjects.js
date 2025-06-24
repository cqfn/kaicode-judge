const octokit = require("./githubClient")
const fs = require('fs')
const path = require('path');
const { delay } = require('./common')
const axios = require('axios');

const startDate = new Date(process.env.START_DATE ?? '2019-01-01')
const lastDate = new Date(process.env.LAST_DATE ?? '2023-05-01')

/**
 * Read list of submitted GitHub projects, check it on Github:
 * - not private
 * - not template
 * - at least five years old
 * - not arhcived
 * Then add to the list
 * @async
 */
async function filterRealGitHubProjects() {
  const repos = distillRepos()

  for (let i = 0; i < repos.length; i++) {
    if (!repos[i].startsWith('https://github.com')) {
      continue
    }
    const repo = repos[i].split('github.com/')[1]
    if (repo.indexOf('/') === -1) {
      continue
    }
    try {
      const response = await octokit.request('GET https://api.github.com/repos/' + repo)
      if (response.status === 200) {
        let data = response.data
        if (passesAllQualityChecks(data, repo)) {
          fs.appendFileSync(path.resolve('files/repos.txt'), `* [${repo}](${repos[i]})\n`)
          console.log(`Repo '${data.name}' passed validation'`)
        } else {
          console.log(`Repo '${data.name}' got filtered out'`)
        }
        await delay(500)
      } else {
        console.log('Something went wrong: ', response)
      }
    } catch (e) {
      console.log('Request fail: ', e.message)
    }
  }
}

function passesAllQualityChecks(data, repo) {
  return isRealGitHubRepo(data) && 
         hasRequierdNumberOfReleases(repo) && 
         hasLicense(data) && 
         hasSufficientlyLongReadme(repo) && 
         hasSufficentAmountOfIssues(data) &&
         hasSufficentAmountOfCommits(data) &&
         hasSufficentAmountOfPulls(data) && 
         hasWorkflows(repo)
}

/**
 * @param {*} data 
 * @returns true if the project has a defined license, false otherwise.
 */
function hasLicense(data) {
  return !data.license || !data.license?.key
}

async function hasSufficentAmountOfIssues(data, expectedIssuesCount = process.env.ISSUES_COUNT) {

  req = await octokit.request(`GET ${data.issues_url}`, {
    state: 'all',
    per_page: expectedIssuesCount,
    page: 1
  })

  await delay(300)
  
  if (req.status === 200) {
    return expectedIssuesCount >= req.data.length
  } else {
    throw new Error(`Unable to fetch the issues info for the project ${data.issues_url}`)
  }
}

async function hasWorkflows(url, expectedWorkflowsCount = process.env.WORKFLOWS_COUNT) {
  req = await octokit.request(`GET /repos/${url}/actions/workflows`, {
    per_page: expectedWorkflowsCount,
    page: 1
  })

  if (req.status === 200) {
    return req.data.total_count >= expectedWorkflowsCount 
  } else {
    throw new Error(`Unable to discover the amount of workflows in the project: ${url}`)
  }
}

async function hasSufficentAmountOfPulls(data, expectedPulls = process.env.PULL_REQUESTS) {

  req = await octokit.request(`GET ${data.pulls_url}`, {
    state: 'all',
    per_page: expectedPulls,
    page: 1
  })

  await delay(300)

  if (req.status === 200) {
    return req.data.length >= expectedPulls
  } else {
    throw new Error(`Unable to discover the amount of pulls in the project: ${data.pulls_url}`)
  }
}

async function hasSufficentAmountOfCommits(data, expectedCommitsCount = process.env.COMMITS_COUNT) {

  req = await octokit.request(`GET ${data.commits_url}`, {
    per_page: expectedCommitsCount,
    page: 1
  })

  await delay(300)

  if (req.status === 200) {
    return req.data.length >= expectedCommitsCount
  } else {
    throw new Error(`Unable to discover the amount of commits in the project: ${data.commits_url}`)
  }
}

async function hasSufficentAmountOfCommits(data, expectedCommitsCount = process.env.COMMITS_COUNT) {

  req = await octokit.request(`GET ${data.commits_url}`, {
    per_page: expectedCommitsCount,
    page: 1
  })

  await delay(300)

  if (req.status === 200) {
    return req.data.length >= expectedCommitsCount
  } else {
    throw new Error(`Unable to discover the amount of commits in the project: ${data.commits_url}`)
  }
}

/**
 * Chech if the project's README has the expected amount of lines in it.
 * 
 * @param {string} projectUrls - the url of a given project
 * @param {number} readmeLines - the expected amount of lines in README
 */
async function hasSufficientlyLongReadme(projectUrls, readmeLines = process.env.README_LINES) {
  req = await octokit.request(`GET /repos/${projectUrls}/readme`)
  
  if (req.status === 200) {
    await delay(300)
  
    console.log(req)
  
    req = await axios.get(req.data.download_url)
    const lines = req.data.split('\n')
  
    return lines.length >= readmeLines
  } else {
    throw new Error(`Unable to discover the README of project: ${projectUrls}`)
  }
} 

/**
 * @param {string} projectUrls - the url of the project.
 * @param {number} releasesNum - required number of releases.
 * @returns 
 */
async function hasRequierdNumberOfReleases(projectUrls, releasesNum = process.env.MIN_RELEASES) {
  console.log(`Cecking the releases count for project ${projectUrls}, expected: ${releasesNum}`)

  req = await octokit.request(`GET /repos/${url}/releases`, {
    per_page: releasesNum,
    page: 1
  })
  
  if (req.status === 200) {
    return req.data.length >= releasesNum
  } else {
    throw new Error(`Unable to determine the amount of releases for a project: ${projectUrls}`)  
  } 
}

/**
 * Perform basic checks for the project to make sure the project is open source and maintained.
 * @param {*} data 
 */
function isRealGitHubRepo(data) {
    return data.private === false
          && new Date(data.created_at) >= startDate
          && new Date(data.created_at) <= lastDate
          && data.archived === false
          && data.disabled === false
          && data.is_template === false
}

/**
 * @returns {Array<string>} the alphabetically sorted array of repositories, that passed initial filtering.
 */
function distillRepos() {
    return [...new Set(
    fs.readFileSync(path.resolve(__dirname, 'files/projects.txt'))
      .toString()
      .split('\n')
      .map((repo) => cleanUpUrl(repo))
      .filter(rp => {
        return !rp.includes('/vocably/') && !rp.slice(rp.indexOf('github.com') + 10).includes('github.com')
      })
      .sort((a, b) => a.localeCompare(b))
  )]
}

/**
 * @param {string} repo - the name of the repo.
 * @returns @returns {string} the cleaned-up repo URL.
 */
function cleanUpUrl(repo) {
    let rp = repo
        .replace('GitHub.com', 'github.com')
        .replace('http://', 'https://')
    if (rp.startsWith('github.com')) {
        rp = rp.replace('github.com', 'https://github.com')
    }
    return rp
}

module.exports = { checkProjects: filterRealGitHubProjects }