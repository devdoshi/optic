import {
  getPathsRelativeToCwd,
  IApiCliConfig,
  IOpticTaskRunnerConfig,
  IPathMapping,
  readApiConfig,
} from '@useoptic/cli-config';
import { EventEmitter } from 'events';
import express from 'express';
import getPort from 'get-port';
import bodyParser from 'body-parser';
import http from 'http';
import { Socket } from 'net';
import path from 'path';
import fs from 'fs-extra';
import {
  CapturesHelpers,
  ExampleRequestsHelpers,
  makeRouter,
} from './routers/spec-router';
import { basePath } from '@useoptic/ui';
import { createProxyMiddleware } from 'http-proxy-middleware';

export const log = fs.createWriteStream('./.optic-daemon.log');

export interface ICliServerConfig {
  cloudApiBaseUrl: string;
}

export interface IOpticExpressRequestAdditions {
  paths: IPathMapping;
  config: IApiCliConfig;
  capturesHelpers: CapturesHelpers;
  exampleRequestsHelpers: ExampleRequestsHelpers;
}

declare global {
  namespace Express {
    export interface Request {
      optic: IOpticExpressRequestAdditions;
    }
  }
}

export interface ICliServerSession {
  id: string;
  path: string;
}

export const shutdownRequested = 'cli-server:shutdown-requested';

class CliServer {
  private server!: http.Server;
  public events: EventEmitter = new EventEmitter();
  private connections: Socket[] = [];

  constructor(private config: ICliServerConfig) {}

  addUiServer(app: express.Application) {
    const resourceRoot = path.resolve(basePath);
    const reactRoot = path.join(resourceRoot, 'build');
    const indexHtmlPath = path.join(reactRoot, 'index.html');
    app.use(express.static(reactRoot));
    app.get('*', (req, res) => {
      res.sendFile(indexHtmlPath);
    });
  }

  async makeServer() {
    const app = express();
    app.set('etag', false);
    const sessions: ICliServerSession[] = [];
    let user: object | null;

    app.get('/api/identity', async (req, res: express.Response) => {
      if (user) {
        res.json({ user });
      } else {
        res.sendStatus(404);
      }
    });
    app.put(
      '/api/identity',
      bodyParser.json({ limit: '5kb' }),
      async (req, res: express.Response) => {
        if (req.body.user) {
          user = req.body.user;
          res.status(202).json({});
        } else {
          res.sendStatus(400);
        }
      }
    );

    // @REFACTOR sessionsRouter
    app.get('/api/sessions', (req, res: express.Response) => {
      res.json({
        sessions,
      });
    });

    app.post(
      '/api/sessions',
      bodyParser.json({ limit: '5kb' }),
      async (req, res: express.Response) => {
        const { path, taskConfig, captureId } = req.body;
        if (captureId && taskConfig) {
          const paths = await getPathsRelativeToCwd(path);
          const { capturesPath } = paths;
          const capturesHelpers = new CapturesHelpers(capturesPath);
          const now = new Date().toISOString();
          await capturesHelpers.updateCaptureState({
            captureId,
            status: 'started',
            metadata: {
              startedAt: now,
              taskConfig,
              lastInteraction: null,
            },
          });
        }
        const existingSession = sessions.find((x) => x.path === path);
        if (existingSession) {
          return res.json({
            session: existingSession,
          });
        }

        const sessionId = (sessions.length + 1).toString();
        const session: ICliServerSession = {
          id: sessionId,
          path,
        };
        sessions.push(session);

        return res.json({
          session,
        });
      }
    );

    // @REFACTOR adminRouter
    app.post(
      '/admin-api/commands',
      bodyParser.json({ limit: '1kb' }),
      async (req, res) => {
        const { body } = req;

        if (body.type === 'shutdown') {
          res.sendStatus(204);
          this.events.emit(shutdownRequested);
          return;
        }

        res.sendStatus(400);
      }
    );

    // specRouter
    const specRouter = makeRouter(sessions);
    app.use('/api/specs/:specId', specRouter);

    // testing service proxy
    app.use(
      '/api/testing',
      createProxyMiddleware({
        changeOrigin: true,
        followRedirects: true,
        target: this.config.cloudApiBaseUrl,
        pathRewrite(input, req) {
          return input.substring(req.baseUrl.length);
        },
      })
    );

    // ui
    this.addUiServer(app);

    return app;
  }

  async start(): Promise<{ port: number }> {
    const app = await this.makeServer();
    const port = await getPort({
      port: [34444],
    });
    return new Promise((resolve, reject) => {
      this.server = app.listen(port, () => {
        resolve({
          port,
        });
      });

      this.server.on('connection', (connection) => {
        log.write(`adding connection\n`);
        this.connections.push(connection);
        connection.on('close', () => {
          log.write(`removing connection\n`);
          this.connections = this.connections.filter((c) => c !== connection);
        });
      });
    });
  }

  async stop() {
    if (this.server) {
      await new Promise((resolve) => {
        log.write(`server closing ${this.connections.length} open\n`);
        this.connections.forEach((connection) => {
          log.write(`destroying existing connection\n`);
          connection.end();
          connection.destroy();
        });
        this.server.close((err) => {
          log.write(`server closed\n`);
          this.connections.forEach((connection) => {
            log.write(`destroying existing connection\n`);
            connection.end();
            connection.destroy();
          });
          if (err) {
            console.error(err);
            log.write(`${err.message}\n`);
          }
          resolve();
        });
      });
    }
  }
}

export { CliServer };
