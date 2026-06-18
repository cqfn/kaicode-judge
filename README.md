GitHub projects validation script for KaiCode competition.

# Usage 

1. Place `projects.txt` into the repo root folder.

2. Run the script
```sh
node start
```

3. Verify the output

After the pipeline completes, check the following files for results:

| File | Stage | Description |
|------|-------|-------------|
| `files/repos.txt` | Step 1 – checkProjects | Repos that passed initial checks (not private, not template, ≥1 year old, not archived, not disabled). Markdown link format. |
| `files/releases.txt` | Step 2 – filterRepos | Repos that passed deeper filtering (≥5 releases, license, README ≥20 lines, ≥10 issues, ≥50 commits, ≥10 PRs, ≥1 CI/CD workflow). |
| `files/directories.txt` | Step 3 – cloneAndFilter | Per-repo directory stats: `repo,dirs,files,files_1k` (comma-separated). |
| `all.txt` | Step 4 – checkRepos | Repos meeting final criteria: dirs ≥10, files ≥50, files with 1,000+ lines <10. |
| `top.txt` | Step 5 – top3 | Manually curated list of top repos (input file, pre-populated). |
| `other.txt` | Step 5 – top3 | Repos from `all.txt` not in `top.txt`, formatted as markdown links. |
| `files/markdown.txt` | Step 6 – urlToMarkdown | All URLs from `files/urls.txt` converted to markdown link format. |
| `projects/` | Step 3 – cloneAndFilter | Cloned git repositories (one subfolder per repo). |

# Project conformance rules

1. Must be a GitHub repository (URL must start with https://github.com)                                                                      
2. Must not be a private repository                                                                                                          
3. Must not be a template repository                                                                                                         
4. Must have been created on or after 2021-01-01                                                                                             
5. Must be at least one year old (created on or before the date one year ago from today)                                                     
6. Must not be archived                                                                                                                      
7. Must not be disabled                                                                                                                      
8. Must have at least 5 releases                                                                                                             
9. Must have a license                                                                                                                       
10. Must have a README with at least 20 lines                                                                                                
11. Must have at least 10 issues                                                                                                             
12. Must have at least 50 commits                                                                                                            
13. Must have at least 10 pull requests                                                                                                      
14. Must have at least 1 CI/CD workflow                                                                                                      
15. Must have at least 10 directories                                                                                                        
16. Must have at least 50 files                                                                                                              
17. Must have fewer than 10 files with 1,000+ lines  
