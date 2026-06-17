GitHub projects validation script for KaiCode competition.

# How to run 

1. Place `projects.txt` into the repo root folder.

2. Run the script
```sh
node start
```

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
