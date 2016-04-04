// ensure env has promise support
// this should probably be moved elsewhere / should be part of the extra
// deps for older environemnts
import 'es6-promise';

import 'isomorphic-fetch';

import {
  isString,
  assign,
} from 'lodash';

import { GraphQLResult } from 'graphql';

export interface Request {
  debugName?: string;
  query?: string;
  variables?: Object;
}

export interface MiddlewareRequest {
  request: Request;
  options: RequestInit;
}

export interface NetworkInterface {
  _uri: string;
  _opts: RequestInit;
  _middlewares: Array<Function>;
  query(request: Request): Promise<GraphQLResult>;
  use(middlewares: Array<Function>);
}

export function createNetworkInterface(uri: string, opts: RequestInit = {}): NetworkInterface {
  if (!uri) {
    throw new Error('A remote enpdoint is required for a network layer');
  }

  if (!isString(uri)) {
    throw new Error('Remote endpoint must be a string');
  }

  const _uri: string = uri;
  const _opts: RequestInit = assign({}, opts);
  const _middlewares: Array<Function> = [];

  function applyMiddlewares(request: Request): Promise<Request> {
    return new Promise((resolve, reject) => {
      const queue = (funcs, scope) => {
        (function next() {
          if (funcs.length > 0) {
            const f = funcs.shift();
            f.applyMiddleware.apply(scope, [{ request, options: _opts }, next]);
          } else {
            resolve(request);
          }
        })();
      };

      // iterate through middlewares using next callback
      queue(_middlewares, this);
    });
  }

  function fetchFromRemoteEndpoint(request: Request): Promise<IResponse> {
    return fetch(uri, assign({}, _opts, {
      body: JSON.stringify(request),
      headers: assign({}, _opts.headers, {
        Accept: '*/*',
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    }));
  };

  function query(request: Request): Promise<GraphQLResult> {
    return applyMiddlewares(request)
      .then((alteredRequest) => {
        return fetchFromRemoteEndpoint(alteredRequest)
          .then(result => result.json())
          .then((payload: GraphQLResult) => {
            if (!payload.hasOwnProperty('data') && !payload.hasOwnProperty('errors')) {
              throw new Error(
                `Server response was missing for query '${request.debugName}'.`
              );
            } else {
              return payload as GraphQLResult;
            }
          });
      });
  };

  function use(middlewares: Array<Function>) {
    _middlewares.push(...middlewares);
  }

  return {
    _uri,
    _opts,
    _middlewares,
    query,
    use,
  };
}
