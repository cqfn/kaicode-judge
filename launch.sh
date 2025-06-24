#!/bin/bash

#Minimum count of workflows in the project in order for a project to be considered as a candidate 
export WORKFLOWS_COUNT=1

#Minimum count of pull requests in the project (both closed, opened, draft etc) in order for a project to be considered as a candidate
export PULL_REQUESTS=10

#Minimum count of issues in the project (both closed and opened) in order for a project to be considered as a candidate
export ISSUES_COUNT=10

#Minimum count of commits in the project in order for a project to be considered as a candidate
export COMMITS_COUNT=50

#Minimum count of releases of a project to be considered as a candidate
export README_LINES=20

# Minimum amount of software releases on GitHub
export MIN_RELEASES="5"

# Minimum start date of the project
export START_DATE="2001-01-01"

# Maximum start date of the project
export LAST_DATE="2023-05-01"

# Token to be used for GitHu API interations 
export GITHUB_TOKEN=

# List of projects to be scanned
PROJECTS=() 

echo $PROJECTS > $(dirname $0)/files/projects.txt

node index.js