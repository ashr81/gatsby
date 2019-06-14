const path = require(`path`)
const os = require(`os`)

const verdaccioConfig = {
  storage: path.join(os.tmpdir(), `verdaccio`, `storage`),
  port: 4873, // default
  web: {
    enable: true,
    title: `gatsby-dev`,
  },
  logs: [{ type: `stdout`, format: `pretty-timestamped`, level: `warn` }],
  packages: {
    "**": {
      access: `$all`,
      publish: `$all`,
      proxy: `npmjs`,
    },
  },
  uplinks: {
    npmjs: {
      url: `https://registry.npmjs.org/`,
    },
  },
}

exports.verdaccioConfig = verdaccioConfig

const registryUrl = `http://localhost:${verdaccioConfig.port}`

exports.registryUrl = registryUrl
