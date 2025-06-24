/**
 * Halts an execution for a given amount of time. Primarely used as a back-pressure for GitHub API.
 * 
 * @param {number} milliseconds 
 * @returns {Promise<undefined>} promise of the result
 */
function delay(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * Extensions that represent image files
 */
const IMAGE_EXTENSIONS = [ 
  "png",
  "svg",
  "jpg",
  "gif",
  "webp",
  "ico",
]

/**
 * Extensions that represent fonts
 */
const FONTS_EXTENSIONS = [ 
  "ttf",
  "woff",
  "eot",
]

/**
 * Extensions that represent non-displayable binary files
 */
const BINARY_FILES = [
  "pdf", "so", "jar", "o", "a"
]

const DOCUMENTATION_FILES = [
  "md", "rst", "mdx", "adoc"
]

const NON_SOURCE_FILES = [
  ...IMAGE_EXTENSIONS,
  ...FONTS_EXTENSIONS, 
  ...BINARY_FILES, 
  ...DOCUMENTATION_FILES
]

/**
 * Makes a guess about the file being a source code file, by looking at the extension of the file
 * 
 * @param {string} filename - the name of the file to be checked   
 * @returns {boolean} true if the given file is considered to be a source file, false otherwise
 */
function isSourceCodeFile(filename) {
  let index = filename.indexOf(".")
  if (index >= 0 && index != filename.length) {
    let extension = filename.slice(index + 1)

    return NON_SOURCE_FILES.includes(extension)
  } else {
    return false
  }
}

module.exports = { delay, isSourceCodeFile }