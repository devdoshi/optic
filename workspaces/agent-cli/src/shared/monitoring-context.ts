import {fromOptic} from "./conversation";
import * as colors from 'colors'
import {IApiCliConfig} from "@useoptic/cli-config";
import * as uuidv4 from "uuid/v4";

export interface IMonitoringContext {
  optic_token: string
  buildId: string
  commitId?: string
  agentId: string
}

export const buildIdENV = 'OPTIC_MONITOR_BUILD'
export const commitIdEnv = 'OPTIC_MONITOR_COMMIT'

export function getMonitoringContext(config: IApiCliConfig): IMonitoringContext | undefined {
  const buildId = process.env[buildIdENV]
  const commitId = process.env[commitIdEnv]
  const optic_token = config.optic_token

  if (!buildId) {
    console.log(fromOptic(colors.red(`api-monitor requires a Build ID to be specified in your environment. Set ${buildIdENV} and try again or run api-monitor tag to export the proper environment variables`)))
    return
  }

  if (!commitId) {
    console.log(fromOptic(colors.red(`api-monitor requires a Commit ID to be specified in your environment. Set ${commitIdEnv} and try again or run api-monitor tag to export the proper environment variables`)))
    return
  }

  if (!optic_token) {
    console.log(fromOptic(colors.red(`api-monitor requires an optic_token to be set in the optic.yml file.`)))
    return
  }

  return {
    agentId: uuidv4(),
    buildId,
    commitId,
    optic_token
  }

}
