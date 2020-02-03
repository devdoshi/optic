import {Command, flags} from '@oclif/command';
import {execSync} from 'child_process'
import {buildIdENV, commitIdEnv} from "../shared/monitoring-context";
import {fromOptic} from "../shared/conversation";
import {cli} from "cli-ux";
export default class Tag extends Command {
  static description = "Tag traffic by build and commit";
  static examples = [
    '$ export $(api monitor --buildId=$CI_BUILD_ID --commitId=$GIT_COMMIT)',
  ]

  static flags = {
    buildId: flags.string({
      required:true
    }),
    commitId: flags.string({
      required:false
    }),
  }

  async run() {
    const {flags} = this.parse(Tag)

    if(!flags.buildId && !flags.commitId) {
      cli.log(fromOptic(`You need to run 'api-monitor tag' with flags '--buildId=' and '--commitId='`))
      process.exit(1)
    }

    console.log(`${buildIdENV}="${flags.buildId}" ${commitIdEnv}="${flags.commitId}"`)
    process.exit(0)
  }
}
