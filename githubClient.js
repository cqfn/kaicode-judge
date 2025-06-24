const {Octokit} = require('octokit')

const token = process.env.GITHUB_TOKEN

if (!token) {
    throw new Error("Expected the GITHUB_TOKEN env variable to be provided")
}

const octokit = new Octokit({ auth: token });

module.exports = { octokit }