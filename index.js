const {octokit} = require('./githubClient')
const { filterRealGitHubProjects } = require('./filterRealGitHubProjects')
const { delay, isSourceCodeFile } = require('./common')

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');

async function filterRepos() {
  const repos = fs.readFileSync(path.resolve(__dirname, 'files/repos.txt'))
    .toString()
    .split('\n')
    .map((repo) => repo
      .slice(repo.indexOf('](') + 2, repo.length - 1)
      .slice('https://github.com/'.length)
  )
  const result = []
  for (let idx in repos) {
    const url = repos[idx]
    let req
    try {
      const response = await octokit.request('GET https://api.github.com/repos/' + url)
      if (response.status === 200) {
        console.log('\nprocessing', url)
        const data = response.data

        await delay(300)

        req = await octokit.request(`GET /repos/${url}/releases`, {
          per_page: 5,
          page: 1
        })

        if (req.status === 200) {
          console.log('releases', req.data.length)
          if (req.data.length !== 5) {
            continue
          }
        } else {
          // TODO: that is not fair, it should be re-tried
          continue
        }

        // Check license
        if (!data.license || !data.license?.key) {
          continue
        }

        await delay(300)

        // Check readme
        req = await octokit.request(`GET /repos/${url}/readme`)

        if (req.status === 200) {
          await delay(300)

          console.log(req)

          req = await axios.get(req.data.download_url)
          const lines = req.data.split('\n')

          if (lines.length < 20) {
            continue
          }
        } else {
          // TODO: that is not fair, it should be re-tried
          continue
        }

        // Issues >= 10
        req = await octokit.request(`GET ${data.issues_url}`, {
          state: 'all',
          per_page: 20,
          page: 1
        })

        if (req.status === 200) {
          console.log('issues', req.data.length)
          if (req.data.length < 10) {
            continue
          }
        } else {
          // TODO: that is not fair, it should be re-tried 
          continue
        }

        await delay(300)

        // Commits >= 50
        req = await octokit.request(`GET ${data.commits_url}`, {
          per_page: 60,
          page: 1
        })

        if (req.status === 200) {
          console.log('commits', req.data.length)

          if (req.data.length < 50) {
            continue
          }
        } else {
          // TODO: that is not fair, it should be re-tried
          continue
        }

        await delay(300)

        // Pulls >= 10
        req = await octokit.request(`GET ${data.pulls_url}`, {
          state: 'all',
          per_page: 11,
          page: 1
        })

        if (req.status === 200) {
          console.log('pulls', req.data.length)
          if (req.data.length < 10) {
            continue
          }
        } else {
          // TODO: that is not fair, it should be re-tried
          continue
        }

        await delay(300)

        // Has workflows
        req = await octokit.request(`GET /repos/${url}/actions/workflows`, {
          per_page: 1,
          page: 1
        })

        if (req.status === 200) {
          console.log('workflows', req.data.total_count)

          if (req.data.total_count === 0) {
            console.log(req.data)
            continue
          }
        }

        console.log('added', url)
        result.push(url)
      } else {
        console.warn('Something went wrong: ', response)
      }
    } catch (e) {
      console.warn('Request fail: ', e.message)
    }
  }

  result.forEach((repo) => {
    fs.appendFileSync(path.resolve(__dirname, 'files/releases.txt'), `${repo}\n`)
  })
}

// Clone all github repositories, process all the files and directories and build hash map for each repo
// [{dirs total, files total, files 1k+ lines}, ...]
function cloneAndFilter() {
  const repos = fs.readFileSync(path.resolve(__dirname, 'files/releases.txt')).toString().split('\n')
  const projects = path.resolve(__dirname, 'projects')

  const processed = fs.readFileSync(path.resolve('files/directories.txt'))
    .toString()
    .split('\n')
    .map((str) => str.slice(0, str.indexOf(',')))

  const filter = function(pth, stat, checked) {
    const directory = function(dir) {
      fs.readdirSync(dir, {withFileTypes: true}).forEach((fd) => {
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
              if (isSourceCodeFile(fd.name)) {
                const len = fs.readFileSync(path.resolve(dir, fd.name)).toString().split('\n').length
                if (len >= 1000) {
                  stat.files_1k++
                  checked.push(path.resolve(dir, fd.name))
                }
              }
            } catch (ex) {
              console.log(dir, fd.name)
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
                ) {
                  const len = fs.readFileSync(path.resolve(dir, fd.name)).toString().split('\n').length
                  if (len >= 1000) {
                    stat.files_1k++
                  }
                }
              } catch (ex) {
                console.log(dir, fd.name)
                throw ex
              }
            } else {
              throw new Error('Symlink refers to something wrong')
            }
          }
        }
      })
    }

    directory(pth)

    return stat
  }

  for (let idx in repos) {
    console.log('left', repos.length - idx)
    const repo = repos[idx]

    if (processed.includes(repo)) {
      console.log('skipping', repo)
      continue
    }

    const folder = repo.split('/')[1]

    if (!fs.existsSync(path.resolve(projects, folder))) {
      console.log('cloning', repo)
      execSync(`git clone https://github.com/${repo}.git`, {cwd: projects})
    }

    console.log('start filtering', repo)
    const stats = filter(path.resolve(projects, folder), {dirs: 0, files: 0, files_1k: 0}, [])

    console.log(repo, stats)

    fs.appendFileSync(
      path.resolve('directories.txt'),
      `${[repo, stats.dirs, stats.files, stats.files_1k].join(',')}\n`
    )
  }
}

// Check if repository contains dirs >= 10, files >= 50 and files 1k+ lines < 10, 
function checkRepos() {
  const lines = fs.readFileSync(path.resolve(__dirname, 'files/directories.txt')).toString().split('\n')

  for (let i = 0; i < lines.length; i++) {
    const data = lines[i].split(',')
    if (data[1] >= 10 && data[2] >= 50 && data[3] < 10) {
      fs.appendFileSync(path.resolve(__dirname, 'files/dirs.txt'), `${data[0]}\n`)
    }
  }
}

function top3() {
  const all = fs.readFileSync(path.resolve(__dirname, 'files/all.txt')).toString().split('\n').map((line) => {
    return line.slice(line.indexOf('(') + 1, line.lastIndexOf(')'))
  })
  const top = fs.readFileSync(path.resolve(__dirname, 'files/top.txt')).toString().split('\n')

  fs.writeFileSync(
    path.resolve(__dirname, 'other.txt'),
    all.filter(url => !top.includes(url))
      .map((url) => `* [${url.slice(url.indexOf('.com/') + 5)}](${url})`)
      .join('\n')
  )
}

// Print github urls to markdown to fast printing to kaicode web page
function urlToMarkdown() {
  fs.writeFileSync(
    path.resolve(__dirname, 'files/markdown.txt'),
    fs.readFileSync(path.resolve(__dirname, 'files/urls.txt'))
      .toString()
      .split('\n')
      .map((url) => `* [${url.slice(url.indexOf('.com/') + 5)}](${url})`)
      .join('\n')
  )
}

async function execute() {
  await filterRealGitHubProjects()
  await filterRepos()
  await cloneAndFilter()
  await checkRepos()
  await top3()
  await urlToMarkdown()
}

execute()