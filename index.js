//require('./fix-slowbuffer'); // Polyfill for Node 25+ compatibility
const bufferModule = require('buffer');

if (!bufferModule.SlowBuffer) {
  class SlowBuffer extends bufferModule.Buffer { }
  bufferModule.SlowBuffer = SlowBuffer;
}

const axios = require('axios');
const { Octokit, App } = require('octokit')
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- Configuration ---
const HTTP_TIMEOUT_MS = 30_000;        // 30 seconds per request
const MAX_RETRIES = 3;                 // max retry attempts after initial failure
const RETRY_BASE_DELAY_MS = 1_000;    // initial retry delay (doubles each attempt)
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

// --- Axios instance with timeout ---
const axiosInstance = axios.create({
  timeout: HTTP_TIMEOUT_MS,
});

// --- Generic retry wrapper with exponential backoff ---
async function withRetry(fn, label = 'request') {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        (err.response && RETRYABLE_STATUS_CODES.includes(err.response.status)) ||
        err.code === 'ECONNABORTED' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ENOTFOUND' ||
        err.code === 'EAI_AGAIN' ||
        err.code === 'ERR_NETWORK' ||
        (err.message && err.message.includes('timeout'));

      if (!isRetryable || attempt === MAX_RETRIES) {
        throw err;
      }

      const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.log(`[withRetry] ${label} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delayMs}ms... (${err.message || err.code || 'unknown error'})`);
      await delay(delayMs);
    }
  }
}

// --- Octokit with timeout and retry ---
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
  request: {
    timeout: HTTP_TIMEOUT_MS,
  },
});

function delay(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

// Read list of submitted GitHub projects, check it on Github:
// - not private
// - not template
// - at least one year old
// - not archieved
// Then add to the list
async function checkProjects() {
  const repos = [...new Set(
    readRelativeOrElseCreate('projects.txt')
      .toString()
      .split('\n')
      .map((repo) => repo.trim())
      .filter((repo) => repo.length > 0)
      .map((repo) => {
        let rp = repo
          .replace('GitHub.com', 'github.com')
          .replace('http://', 'https://')
        if (rp.startsWith('github.com')) {
          rp = rp.replace('github.com', 'https://github.com')
        }
        return rp
      })
      .filter(rp => {
        return !rp.includes('/vocably/') && !rp.slice(rp.indexOf('github.com') + 10).includes('github.com')
      })
      .sort((a, b) => a.localeCompare(b))
  )]

  console.log(`[checkProjects] Starting validation of ${repos.length} unique repo URLs`)

  if (!fs.existsSync(path.resolve('files'))) {
    fs.mkdirSync(path.resolve('files'))
    console.log('[checkProjects] Created "files" directory')
  }

  const today = new Date();
  const oneYearsAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

  const startDate = new Date('2021-01-01')
  console.log(`[checkProjects] Date filters: startDate=${startDate.toISOString().slice(0, 10)}, oneYearsAgo=${oneYearsAgo.toISOString().slice(0, 10)}`)

  let addedCount = 0
  let skippedCount = 0

  for (let i = 0; i < repos.length; i++) {
    if (!repos[i].startsWith('https://github.com')) {
      console.log(`[checkProjects] Skipping non-GitHub URL: ${repos[i]}`)
      skippedCount++
      continue
    }
    const repo = repos[i].split('github.com/')[1]
    if (repo.indexOf('/') === -1) {
      console.log(`[checkProjects] Skipping malformed repo path (no slash): ${repos[i]}`)
      skippedCount++
      continue
    }
    console.log(`[checkProjects] [${i + 1}/${repos.length}] Checking repo: ${repo}`)
    try {
      const response = await withRetry(
        () => octokit.request('GET https://api.github.com/repos/' + repo),
        `GET /repos/${repo}`
      )
      if (response.status === 200) {
        let data = response.data
        const reasons = []
        if (data.private) reasons.push('is private')
        if (new Date(data.created_at) < startDate) reasons.push(`created ${data.created_at.slice(0, 10)} before start date`)
        if (new Date(data.created_at) > oneYearsAgo) reasons.push(`created ${data.created_at.slice(0, 10)} after one-years-ago cutoff`)
        if (data.archived) reasons.push('is archived')
        if (data.disabled) reasons.push('is disabled')
        if (data.is_template) reasons.push('is a template')

        if (data.private === false
          && new Date(data.created_at) >= startDate
          && new Date(data.created_at) <= oneYearsAgo
          && data.archived === false
          && data.disabled === false
          && data.is_template === false
        ) {
          fs.appendFileSync(
            path.resolve('files/repos.txt'),
            `* [${repo}](${repos[i]})\n`
          )
          addedCount++
          console.log(`[checkProjects] Repo PASSED all checks and was added: ${repo} (total added: ${addedCount})`)
        } else {
          console.log(`[checkProjects] Repo FAILED checks: ${repo} — reasons: ${reasons.join(', ')}`)
        }
      } else {
        console.log(`[checkProjects] Unexpected response status ${response.status} for repo: ${repo}`)
      }
    } catch (e) {
      console.log(`[checkProjects] API request failed for repo ${repo}: ${e.message}`)
    }
  }

  console.log(`[checkProjects] Complete. Added: ${addedCount}, Skipped/failed: ${repos.length - addedCount}`)
}

async function filterRepos() {
  console.log('[filterRepos] Starting repository filtering pipeline')

  if (!fs.existsSync("files")) {
    fs.mkdirSync("files")
    console.log('[filterRepos] Created "files" directory')
  }

  const repos = readRelativeOrElseCreate('files/repos.txt')
    .toString()
    .split('\n')
    .map((repo) => repo
      .slice(repo.indexOf('](') + 2, repo.length - 1)
      .slice(19)
    )

  console.log(`[filterRepos] Loaded ${repos.length} repos from files/repos.txt`)

  const result = []
  let rejectedCount = 0

  for (let idx in repos) {
    const url = repos[idx].trim()
    if (!url) continue

    console.log(`[filterRepos] [${Number(idx) + 1}/${repos.length}] Processing: ${url}`)
    let req
    try {
      const response = await withRetry(
        () => octokit.request('GET https://api.github.com/repos/' + url),
        `GET /repos/${url}`
      )
      if (response.status === 200) {
        const data = response.data
        console.log(`[filterRepos] Fetched repo info for ${url}: stars=${data.stargazers_count}, forks=${data.forks_count}, license=${data.license?.key || 'none'}`)

        // --- Releases check ---
        await delay(300)
        req = await withRetry(
          () => octokit.request(`GET /repos/${url}/releases`, { per_page: 5, page: 1 }),
          `GET /repos/${url}/releases`
        )

        if (req.status === 200) {
          console.log(`[filterRepos] Releases check: found ${req.data.length} releases for ${url}`)
          if (req.data.length !== 5) {
            console.log(`[filterRepos] REJECTED ${url}: releases count ${req.data.length} < 5`)
            rejectedCount++
            continue
          }
        } else {
          console.log(`[filterRepos] REJECTED ${url}: releases request returned status ${req.status}`)
          rejectedCount++
          continue
        }

        // --- License check ---
        if (!data.license || !data.license?.key) {
          console.log(`[filterRepos] REJECTED ${url}: no license found`)
          rejectedCount++
          continue
        }
        console.log(`[filterRepos] License check passed: ${data.license.key}`)

        // --- README check ---
        await delay(300)
        console.log(`[filterRepos] Checking README for ${url}`)
        req = await withRetry(
          () => octokit.request(`GET /repos/${url}/readme`),
          `GET /repos/${url}/readme`
        )

        if (req.status === 200) {
          await delay(300)
          req = await withRetry(
            () => axiosInstance.get(req.data.download_url),
            `GET ${req.data.download_url}`
          )
          let lines = req.data.split('\n')
          console.log(`[filterRepos] README initial line count: ${lines.length}`)

          // If README is too short, check root directory for other README files
          if (lines.length < 20) {
            await delay(300)
            const rootReq = await withRetry(
              () => octokit.request(`GET /repos/${url}/contents`),
              `GET /repos/${url}/contents`
            )
            if (rootReq.status === 200) {
              const readmeFile = rootReq.data.find(file =>
                file.type === 'file' && /^readme\.(md|rst|txt)$/i.test(file.name)
              )
              if (readmeFile) {
                await delay(300)
                const contentReq = await withRetry(
                  () => axiosInstance.get(readmeFile.download_url),
                  `GET ${readmeFile.download_url}`
                )
                lines = contentReq.data.split('\n')
                console.log(`[filterRepos] Found alternate README "${readmeFile.name}" with ${lines.length} lines`)
              } else {
                console.log(`[filterRepos] No alternate README file found in root directory`)
              }
            }
          }

          if (lines.length < 20) {
            console.log(`[filterRepos] REJECTED ${url}: README too short (${lines.length} lines, minimum 20)`)
            rejectedCount++
            continue
          }
          console.log(`[filterRepos] README check passed: ${lines.length} lines`)
        } else {
          console.log(`[filterRepos] REJECTED ${url}: readme request returned status ${req.status}`)
          rejectedCount++
          continue
        }

        // --- Issues check (>= 10) ---
        req = await withRetry(
          () => octokit.request(`GET ${data.issues_url}`, { state: 'all', per_page: 20, page: 1 }),
          `GET ${data.issues_url}`
        )

        if (req.status === 200) {
          console.log(`[filterRepos] Issues check: found ${req.data.length} issues for ${url}`)
          if (req.data.length < 10) {
            console.log(`[filterRepos] REJECTED ${url}: issues count ${req.data.length} < 10`)
            rejectedCount++
            continue
          }
        } else {
          console.log(`[filterRepos] REJECTED ${url}: issues request returned status ${req.status}`)
          rejectedCount++
          continue
        }

        await delay(300)

        // --- Commits check (>= 50) ---
        req = await withRetry(
          () => octokit.request(`GET ${data.commits_url}`, { per_page: 60, page: 1 }),
          `GET ${data.commits_url}`
        )
        if (req.status === 200) {
          console.log(`[filterRepos] Commits check: found ${req.data.length} commits for ${url}`)
          if (req.data.length < 50) {
            console.log(`[filterRepos] REJECTED ${url}: commits count ${req.data.length} < 50`)
            rejectedCount++
            continue
          }
        } else {
          console.log(`[filterRepos] REJECTED ${url}: commits request returned status ${req.status}`)
          rejectedCount++
          continue
        }

        await delay(300)

        // --- Pulls check (>= 10) ---
        req = await withRetry(
          () => octokit.request(`GET ${data.pulls_url}`, { state: 'all', per_page: 11, page: 1 }),
          `GET ${data.pulls_url}`
        )

        if (req.status === 200) {
          console.log(`[filterRepos] Pulls check: found ${req.data.length} pulls for ${url}`)
          if (req.data.length < 10) {
            console.log(`[filterRepos] REJECTED ${url}: pulls count ${req.data.length} < 10`)
            rejectedCount++
            continue
          }
        } else {
          console.log(`[filterRepos] REJECTED ${url}: pulls request returned status ${req.status}`)
          rejectedCount++
          continue
        }

        await delay(300)

        // --- Workflows check ---
        req = await withRetry(
          () => octokit.request(`GET /repos/${url}/actions/workflows`, { per_page: 1, page: 1 }),
          `GET /repos/${url}/actions/workflows`
        )

        if (req.status === 200) {
          console.log(`[filterRepos] Workflows check: found ${req.data.total_count} workflows for ${url}`)
          if (req.data.total_count === 0) {
            console.log(`[filterRepos] REJECTED ${url}: no CI/CD workflows found`)
            rejectedCount++
            continue
          }
        } else {
          console.log(`[filterRepos] REJECTED ${url}: workflows request returned status ${req.status}`)
          rejectedCount++
          continue
        }

        console.log(`[filterRepos] PASSED all filters: ${url}`)
        result.push(url)
      } else {
        console.log(`[filterRepos] REJECTED ${url}: repo info request returned unexpected status ${response.status}`)
        rejectedCount++
      }
    } catch (e) {
      console.log(`[filterRepos] API request failed for ${url}: ${e.message}`)
      rejectedCount++
    }
  }

  console.log(`[filterRepos] Filtering complete. Passed: ${result.length}, Rejected: ${rejectedCount}`)

  result.forEach((repo) => {
    fs.appendFileSync(path.resolve(__dirname, 'files/releases.txt'), `${repo}\n`)
  })

  console.log(`[filterRepos] Wrote ${result.length} repos to files/releases.txt`)
}

// Clone all github repositories, process all the files and directories and build hash map for each repo
// [{dirs total, files total, files 1k+ lines}, ...]
function cloneAndFilter() {
  console.log('[cloneAndFilter] Starting clone and directory analysis')

  const repos = readRelativeOrElseCreate('files/releases.txt').toString().split('\n').filter(r => r.trim())
  const projects = path.resolve(__dirname, 'projects')

  console.log(`[cloneAndFilter] Loaded ${repos.length} repos from files/releases.txt`)

  const processed = readRelativeOrElseCreate('files/directories.txt')
    .toString()
    .split('\n')
    .map((str) => str.slice(0, str.indexOf(',')))
    .filter(s => s.trim())

  console.log(`[cloneAndFilter] ${processed.length} repos already processed (will be skipped)`)

  const filter = function (pth, stat, checked) {
    const directory = function (dir) {
      fs.readdirSync(dir, { withFileTypes: true }).forEach((fd) => {
        if (!checked.includes(path.resolve(dir, fd.name))) {
          if (fd.isDirectory()) {
            if (fd.name !== '.git') {
              stat.dirs++
              directory(path.resolve(dir, fd.name))
              checked.push(path.resolve(dir, fd.name))
            }
          } else if (fd.isFile()) {
            stat.files++
            try {
              if (
                // fd.name.endsWith('.py')
                !fd.name.endsWith('.png')
                && !fd.name.endsWith('.jpg')
                && !fd.name.endsWith('.svg')
                && !fd.name.endsWith('.eot')
                && !fd.name.endsWith('.ttf')
                && !fd.name.endsWith('.woff')
                && !fd.name.endsWith('.pdf')
                && !fd.name.endsWith('.ico')
                && !fd.name.endsWith('.rst')
                && !fd.name.endsWith('.gif')
                && !fd.name.endsWith('.webp')
                && !fd.name.endsWith('.pkl')
                && !fd.name.endsWith('.pickle')
                && !fd.name.endsWith('.json')
                && !fd.name.endsWith('.tar.gz')
                && !fd.name.endsWith('.zip')
                && !fd.name.endsWith('.tar')
                && !fd.name.endsWith('.gz')
                && !fd.name.endsWith('.so')
                && !fd.name.endsWith('.dll')
                && !fd.name.endsWith('.dylib')
              ) {
                const len = fs.readFileSync(path.resolve(dir, fd.name)).toString().split('\n').length
                if (len >= 1000) {
                  stat.files_1k++
                  checked.push(path.resolve(dir, fd.name))
                }
              }
            } catch (ex) {
              console.log(`[cloneAndFilter] Error reading file ${fd.name} in ${dir}: ${ex.message}`)
              throw ex
            }
          } else if (fd.isSymbolicLink()) {
            const link = fs.readlinkSync(path.resolve(dir, fd.name))

            const res = path.resolve(dir, link)

            const s = fs.statSync(res)

            if (s.isDirectory()) {
              directory(res)
              checked.push(res)
            } else if (s.isFile()) {
              stat.files++
              checked.push(path.resolve(dir, fd.name))
              try {
                if (!fd.name.endsWith('.png')
                  && !fd.name.endsWith('.jpg')
                  && !fd.name.endsWith('.svg')
                  && !fd.name.endsWith('.eot')
                  && !fd.name.endsWith('.ttf')
                  && !fd.name.endsWith('.woff')
                  && !fd.name.endsWith('.pdf')
                  && !fd.name.endsWith('.pkl')
                  && !fd.name.endsWith('.pickle')
                  && !fd.name.endsWith('.json')
                  && !fd.name.endsWith('.tar.gz')
                  && !fd.name.endsWith('.zip')
                  && !fd.name.endsWith('.tar')
                  && !fd.name.endsWith('.gz')
                  && !fd.name.endsWith('.so')
                  && !fd.name.endsWith('.dll')
                  && !fd.name.endsWith('.dylib')
                ) {
                  const len = fs.readFileSync(path.resolve(dir, fd.name)).toString().split('\n').length
                  if (len >= 1000) {
                    stat.files_1k++
                  }
                }
              } catch (ex) {
                console.log(`[cloneAndFilter] Error reading symlinked file ${fd.name} in ${dir}: ${ex.message}`)
                throw ex
              }
            } else {
              console.log(`[cloneAndFilter] Symlink ${fd.name} in ${dir} refers to unexpected type`)
              throw new Error('Symlink refers to something wrong')
            }
          }
        }
      })
    }

    directory(pth)

    return stat
  }

  let clonedCount = 0
  let skippedCount = 0
  let analyzedCount = 0

  for (let idx in repos) {
    const repo = repos[idx].trim()
    if (!repo) continue

    const progress = `[${Number(idx) + 1}/${repos.length}]`

    if (processed.includes(repo)) {
      console.log(`[cloneAndFilter] ${progress} Skipping already-processed repo: ${repo}`)
      skippedCount++
      continue
    }

    const folder = repo.split('/')[1]

    if (!fs.existsSync(path.resolve(projects))) {
      fs.mkdirSync(path.resolve(projects))
      console.log(`[cloneAndFilter] Created projects directory: ${projects}`)
    }

    if (!fs.existsSync(path.resolve(projects, folder))) {
      console.log(`[cloneAndFilter] ${progress} Cloning repo: ${repo}`)
      try {
        execSync(`git clone https://github.com/${repo}.git`, { cwd: projects })
        clonedCount++
        console.log(`[cloneAndFilter] Successfully cloned: ${repo}`)
      } catch (e) {
        console.log(`[cloneAndFilter] Failed to clone ${repo}: ${e.message}`)
        continue
      }
    } else {
      console.log(`[cloneAndFilter] ${progress} Repo folder already exists, skipping clone: ${folder}`)
    }

    console.log(`[cloneAndFilter] ${progress} Analyzing directory structure for: ${repo}`)
    const stats = filter(path.resolve(projects, folder), { dirs: 0, files: 0, files_1k: 0 }, [])

    console.log(`[cloneAndFilter] ${progress} Analysis complete for ${repo}: dirs=${stats.dirs}, files=${stats.files}, files_1k=${stats.files_1k}`)
    analyzedCount++

    fs.appendFileSync(
      path.resolve(__dirname, 'files/directories.txt'),
      `${[repo, stats.dirs, stats.files, stats.files_1k].join(',')}\n`
    )
    console.log(`[cloneAndFilter] Appended stats to files/directories.txt for ${repo}`)
  }

  console.log(`[cloneAndFilter] Complete. Analyzed: ${analyzedCount}, Cloned: ${clonedCount}, Skipped: ${skippedCount}`)
}

// Check if repository contains dirs >= 10, files >= 50 and files 1k+ lines < 10, 
function checkRepos() {
  console.log('[checkRepos] Checking repos against criteria: dirs>=10, files>=50, files_1k<10')

  const lines = readRelativeOrElseCreate('files/directories.txt').toString().split('\n').filter(l => l.trim())
  console.log(`[checkRepos] Loaded ${lines.length} entries from files/directories.txt`)

  let passedCount = 0

  for (let i = 0; i < lines.length; i++) {
    const data = lines[i].split(',')
    const repo = data[0]
    const dirs = Number(data[1])
    const files = Number(data[2])
    const files1k = Number(data[3])

    if (dirs >= 10 && files >= 50 && files1k < 10) {
      fs.appendFileSync(path.resolve(__dirname, 'all.txt'), `${data[0]}\n`)
      passedCount++
      console.log(`[checkRepos] PASSED: ${repo} (dirs=${dirs}, files=${files}, files_1k=${files1k})`)
    } else {
      console.log(`[checkRepos] FAILED: ${repo} (dirs=${dirs}, files=${files}, files_1k=${files1k})`)
    }
  }

  console.log(`[checkRepos] Complete. ${passedCount}/${lines.length} repos passed all criteria`)
}

function top3() {
  console.log('[top3] Separating top repos from others')

  const all = readRelativeOrElseCreate('all.txt').toString().split('\n').filter(l => l.trim())
  const top = readRelativeOrElseCreate('top.txt').toString().split('\n').filter(l => l.trim())

  console.log(`[top3] Total repos: ${all.length}, Top repos: ${top.length}`)

  const others = all.filter(repo => !top.includes(repo))
  console.log(`[top3] Other repos (not in top): ${others.length}`)

  fs.writeFileSync(
    path.resolve(__dirname, 'other.txt'),
    others
      .map((repo) => `* [${repo}](https://github.com/${repo})`)
      .join('\n')
  )

  console.log(`[top3] Wrote ${others.length} other repos to other.txt`)
}

// Print github urls to markdown to fast printing on kaicode web page
function urlToMarkdown() {
  console.log('[urlToMarkdown] Converting URLs to markdown format')

  const urls = readRelativeOrElseCreate('files/urls.txt')
    .toString()
    .split('\n')
    .filter(u => u.trim())

  console.log(`[urlToMarkdown] Loaded ${urls.length} URLs from files/urls.txt`)

  const markdown = urls
    .map((url) => `* [${url.slice(url.indexOf('.com/') + 5)}](${url})`)
    .join('\n')

  fs.writeFileSync(
    path.resolve(__dirname, 'files/markdown.txt'),
    markdown
  )

  console.log(`[urlToMarkdown] Wrote ${urls.length} markdown entries to files/markdown.txt`)
}

function readRelativeOrElseCreate(filePath) {
  if (!fs.existsSync(path.resolve(__dirname, filePath))) {
    fs.writeFileSync(path.resolve(__dirname, filePath), '')
  }
  return fs.readFileSync(path.resolve(__dirname, filePath))
}

async function execute() {
  console.log('=== KaiCode Judge Pipeline Starting ===')

  await checkProjects()
  console.log('[DONE] Step 1/6: Projects list check')

  await filterRepos()
  console.log('[DONE] Step 2/6: Filter repos')

  await cloneAndFilter()
  console.log('[DONE] Step 3/6: Clone & filter')

  await checkRepos()
  console.log('[DONE] Step 4/6: Check repos')

  await top3()
  console.log('[DONE] Step 5/6: Top 3')

  await urlToMarkdown()
  console.log('[DONE] Step 6/6: Output')

  console.log('=== KaiCode Judge Pipeline Complete ===')
}

execute()
