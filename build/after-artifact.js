// Ký các artifact .exe cuối cùng (bộ cài NSIS) sau khi build xong.
const { signFile } = require('./sign-file')

exports.default = async function afterAllArtifactBuild(buildResult) {
  const paths = buildResult.artifactPaths || []
  for (const p of paths) {
    if (p.toLowerCase().endsWith('.exe')) signFile(p)
  }
  return []
}
