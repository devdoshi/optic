import Command from '@oclif/command';
import {Client} from '@useoptic/cli-client';
import {IOpticTaskRunnerConfig, parseIgnore, TaskToStartConfig} from '@useoptic/cli-config';
import {getPathsRelativeToConfig, readApiConfig, shouldWarnAboutVersion7Compatibility} from '@useoptic/cli-config';
import {IApiCliConfig, IPathMapping} from '@useoptic/cli-config';
import {makeUiBaseUrl} from '@useoptic/cli-server';
import {checkDiffOrUnrecognizedPath, IApiInteraction} from '@useoptic/domain';
import * as colors from 'colors';
import {fromOptic} from './conversation';
import {userDebugLogger} from './logger';
import {CommandAndProxySessionManager} from './command-and-proxy-session-manager';
import * as uuidv4 from 'uuid/v4';

import {getMonitoringContext} from "./monitoring-context";

async function setupTaskWithConfig(cli: Command, taskName: string, paths: IPathMapping, config: IApiCliConfig) {
  const {cwd, capturesPath, specStorePath} = paths;
  const task = config.tasks[taskName];
  if (!task) {
    return cli.log(colors.red(`No task ${colors.bold(taskName)} found in optic.yml`));
  }

  const captureId = uuidv4();
  const startConfig = await TaskToStartConfig(task, captureId);

  // start proxy and command session
  // const persistenceManagerFactory = () => {
  //   return new FileSystemCaptureSaver({
  //     captureBaseDirectory: capturesPath
  //   });
  // };
  // try {
    await runTask(startConfig);
  // } catch (e) {
  //   cli.error(e.message);
  // } finally {
  //
  //   const loader: ICaptureLoader = new FileSystemCaptureLoader({
  //     captureBaseDirectory: capturesPath
  //   });
  //   const filter = parseIgnore(config.ignoreRequests || []);
  //   const capture = await loader.loadWithFilter(captureId, filter);

}

export async function setupTask(cli: Command, taskName: string) {

  try {
    const paths = await getPathsRelativeToConfig();
    const config = await readApiConfig(paths.configPath);
    try {
      const monitoringContext = getMonitoringContext(config)
      if (monitoringContext) {
        await setupTaskWithConfig(cli, taskName, paths, config);
      } else {
        cli.log(fromOptic(colors.red('Exiting. Optic will not run your task until the monitoring configuration is valid')))
      }
    } catch (e) {
      cli.error(e);
    }
  } catch (e) {
    userDebugLogger(e);
    cli.log(fromOptic('Optic configuration is not valid. Please verify your optic.yml file is valid and try again.'));
    process.exit(0);
  }
  process.exit(0);
}

export interface ICaptureSaver {
  init(captureId: string): Promise<void>
  save(sample: IApiInteraction): Promise<void>
}

class BatchUploader implements ICaptureSaver {
  async init(captureId: string): Promise<void> {
    return undefined;
  }

  async save(sample: IApiInteraction): Promise<void> {
    return undefined;
  }
}

export async function runTask(taskConfig: IOpticTaskRunnerConfig): Promise<void> {
  const sessionManager = new CommandAndProxySessionManager(taskConfig);

  const persistenceManager = new BatchUploader();

  await sessionManager.run(persistenceManager);
}
