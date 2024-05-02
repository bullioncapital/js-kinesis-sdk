import URI from "urijs";
import URITemplate from "urijs/src/URITemplate";

import { BadRequestError, NetworkError, NotFoundError } from "./errors";
import { Horizon } from "./horizon_api";
import HorizonAxiosClient from "./horizon_axios_client";
import { ServerApi } from "./server_api";

/* tslint:disable-next-line:no-var-requires */
const version = require("../package.json").version;

// Resources which can be included in the Horizon response via the `join`
// query-param.
const JOINABLE = ["transaction"];

type Constructable<T> = new (e: string) => T;

export interface EventSourceOptions<T> {
  onmessage?: (value: T) => void;
  onerror?: (event: MessageEvent) => void;
  reconnectTimeout?: number;
}

const anyGlobal = global as any;
// require("eventsource") for Node and React Native environment
let EventSource: Constructable<EventSource> =
  anyGlobal.EventSource ??
  anyGlobal.window?.EventSource ??
  require("eventsource");

/**
 * Creates a new {@link CallBuilder} pointed to server defined by serverUrl.
 *
 * This is an **abstract** class. Do not create this object directly, use {@link Server} class.
 * @param {string} serverUrl URL of Horizon server
 * @class CallBuilder
 */
export class CallBuilder<
  T extends
    | Horizon.FeeStatsResponse
    | Horizon.BaseResponse
    | ServerApi.CollectionPage<Horizon.BaseResponse>,
> {
  protected url: URI;
  public filter: string[][];
  protected originalSegments: string[];
  protected neighborRoot: string;

  constructor(serverUrl: URI, neighborRoot: string = "") {
    this.url = serverUrl.clone();
    this.filter = [];
    this.originalSegments = this.url.segment() || [];
    this.neighborRoot = neighborRoot;
  }

  /**
   * Triggers a HTTP request using this builder's current configuration.
   * @returns {Promise} a Promise that resolves to the server's response.
   */
  public call(): Promise<T> {
    this.checkFilter();
    return this._sendNormalRequest(this.url).then((r) =>
      this._parseResponse(r)
    );
  }
  //// TODO: Migrate to async, BUT that's a change in behavior and tests "rejects two filters" will fail.
  //// It's because async will check within promise, which makes more sense when using awaits instead of Promises.
  // public async call(): Promise<T> {
  //   this.checkFilter();
  //   const r = await this._sendNormalRequest(this.url);
  //   return this._parseResponse(r);
  // }
  //// /* actually equals */
  //// public call(): Promise<T> {
  ////   return Promise.resolve().then(() => {
  ////     this.checkFilter();
  ////     return this._sendNormalRequest(this.url)
  ////   }).then((r) => {
  ////     this._parseResponse(r)
  ////   });
  //// }

  /**
   * Creates an EventSource that listens for incoming messages from the server. To stop listening for new
   * events call the function returned by this method.
   * @see [Horizon Response Format](https://developers.stellar.org/api/introduction/response-format/)
   * @see [MDN EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
   * @param {object} [options] EventSource options.
   * @param {function} [options.onmessage] Callback function to handle incoming messages.
   * @param {function} [options.onerror] Callback function to handle errors.
   * @param {number} [options.reconnectTimeout] Custom stream connection timeout in ms, default is 15 seconds.
   * @returns {function} Close function. Run to close the connection and stop listening for new events.
   */
  public stream(options: EventSourceOptions<T> = {}): () => void {
    this.checkFilter();

    this.url.setQuery("X-Client-Name", "js-stellar-sdk");
    this.url.setQuery("X-Client-Version", version);

    // EventSource object
    let es: EventSource;
    // timeout is the id of the timeout to be triggered if there were no new messages
    // in the last 15 seconds. The timeout is reset when a new message arrive.
    // It prevents closing EventSource object in case of 504 errors as `readyState`
    // property is not reliable.
    let timeout: NodeJS.Timeout;

    const createTimeout = () => {
      timeout = setTimeout(
        () => {
          if (es) {
            es.close();
          }
          /* tslint:disable-next-line:no-use-before-declare */
          es = createEventSource();
        },
        options.reconnectTimeout || 15 * 1000
      );
    };

    const createEventSource = () => {
      try {
        es = new EventSource(this.url.toString());
      } catch (err: any) {
        if (options.onerror) {
          options.onerror(err);
        }
      }

      createTimeout();

      if (es) {
        // when receiving the close message from Horizon we should
        // close the connection and recreate the event source
        let closed = false;
        const onClose = () => {
          if (closed) {
            return;
          }

          clearTimeout(timeout);
          es.close();
          createEventSource();
          closed = true;
        };

        const onMessage = (message: any) => {
          if (message.type === "close") {
            onClose();
            return;
          }

          const result = message.data
            ? this._parseRecord(JSON.parse(message.data))
            : message;
          if (result.paging_token) {
            this.url.setQuery("cursor", result.paging_token);
          }
          clearTimeout(timeout);
          createTimeout();
          if (typeof options.onmessage !== "undefined") {
            options.onmessage(result);
          }
        };

        const onError = (error: any) => {
          if (options.onerror) {
            options.onerror(error as MessageEvent);
          }
        };

        // use addEventListener too, just in case
        if (es.addEventListener) {
          es.addEventListener("message", onMessage.bind(this));
          es.addEventListener("error", onError.bind(this));
          es.addEventListener("close", onClose.bind(this));
        } else {
          es.onmessage = onMessage.bind(this);
          es.onerror = onError.bind(this);
        }
      }

      return es;
    };

    createEventSource();
    return function close() {
      clearTimeout(timeout);

      if (es) {
        es.close();
      }
    };
  }

  /**
   * Sets `cursor` parameter for the current call. Returns the CallBuilder object on which this method has been called.
   * @see [Paging](https://developers.stellar.org/api/introduction/pagination/)
   * @param {string} cursor A cursor is a value that points to a specific location in a collection of resources.
   * @returns {object} current CallBuilder instance
   */
  public cursor(cursor: string): this {
    this.url.setQuery("cursor", cursor);
    return this;
  }

  /**
   * Sets `limit` parameter for the current call. Returns the CallBuilder object on which this method has been called.
   * @see [Paging](https://developers.stellar.org/api/introduction/pagination/)
   * @param {number} number Number of records the server should return.
   * @returns {object} current CallBuilder instance
   */
  public limit(recordsNumber: number): this {
    this.url.setQuery("limit", recordsNumber.toString());
    return this;
  }

  /**
   * Sets `order` parameter for the current call. Returns the CallBuilder object on which this method has been called.
   * @param {"asc"|"desc"} direction Sort direction
   * @returns {object} current CallBuilder instance
   */
  public order(direction: "asc" | "desc"): this {
    this.url.setQuery("order", direction);
    return this;
  }

  /**
   * Sets `join` parameter for the current call. The `join` parameter
   * includes the requested resource in the response. Currently, the
   * only valid value for the parameter is `transactions` and is only
   * supported on the operations and payments endpoints. The response
   * will include a `transaction` field for each operation in the
   * response.
   *
   * @param {"transactions"} join Records to be included in the response.
   * @returns {object} current CallBuilder instance.
   */
  public join(include: "transactions"): this {
    this.url.setQuery("join", include);
    return this;
  }

  /**
   * A helper method to craft queries to "neighbor" endpoints.
   *
   *  For example, we have an `/effects` suffix endpoint on many different
   *  "root" endpoints, such as `/transactions/:id` and `/accounts/:id`. So,
   *  it's helpful to be able to conveniently create queries to the
   *  `/accounts/:id/effects` endpoint:
   *
   *    this.forEndpoint("accounts", accountId)`.
   *
   * @param  {string} endpoint neighbor endpoint in question, like /operations
   * @param  {string} param    filter parameter, like an operation ID
   *
   * @returns {CallBuilder} this CallBuilder instance
   */
  protected forEndpoint(endpoint: string, param: string): this {
    if (this.neighborRoot === "") {
      throw new Error("Invalid usage: neighborRoot not set in constructor");
    }
    this.filter.push([endpoint, param, this.neighborRoot]);
    return this;
  }

  /**
   * @private
   * @returns {void}
   */
  private checkFilter(): void {
    if (this.filter.length >= 2) {
      throw new BadRequestError("Too many filters specified", this.filter);
    }

    if (this.filter.length === 1) {
      // append filters to original segments
      const newSegment = this.originalSegments.concat(this.filter[0]);
      this.url.segment(newSegment);
    }
  }

  /**
   * Convert a link object to a function that fetches that link.
   * @private
   * @param {object} link A link object
   * @param {bool} link.href the URI of the link
   * @param {bool} [link.templated] Whether the link is templated
   * @returns {function} A function that requests the link
   */
  private _requestFnForLink(link: Horizon.ResponseLink): (opts?: any) => any {
    return async (opts: any = {}) => {
      let uri;

      if (link.templated) {
        const template = URITemplate(link.href);
        uri = URI(template.expand(opts) as any); // TODO: fix upstream types.
      } else {
        uri = URI(link.href);
      }

      const r = await this._sendNormalRequest(uri);
      return this._parseResponse(r);
    };
  }

  /**
   * Given the json response, find and convert each link into a function that
   * calls that link.
   * @private
   * @param {object} json JSON response
   * @returns {object} JSON response with string links replaced with functions
   */
  private _parseRecord(json: any): any {
    if (!json._links) {
      return json;
    }
    for (const key of Object.keys(json._links)) {
      const n = json._links[key];
      let included = false;
      // If the key with the link name already exists, create a copy
      if (typeof json[key] !== "undefined") {
        json[`${key}_attr`] = json[key];
        included = true;
      }

      /*
       If the resource can be side-loaded using `join` query-param then don't
       try to load from the server. We need to whitelist the keys which are
       joinable, since there are other keys like `ledger` which is included in
       some payloads, but doesn't represent the ledger resource, in that
       scenario we want to make the call to the server using the URL from links.
      */
      if (included && JOINABLE.indexOf(key) >= 0) {
        const record = this._parseRecord(json[key]);
        // Maintain a promise based API so the behavior is the same whether you
        // are loading from the server or in-memory (via join).
        json[key] = async () => record;
      } else {
        json[key] = this._requestFnForLink(n as Horizon.ResponseLink);
      }
    }
    return json;
  }

  private async _sendNormalRequest(initialUrl: URI) {
    let url = initialUrl;

    if (url.authority() === "") {
      url = url.authority(this.url.authority());
    }

    if (url.protocol() === "") {
      url = url.protocol(this.url.protocol());
    }

    return HorizonAxiosClient.get(url.toString())
      .then((response) => response.data)
      .catch(this._handleNetworkError);
  }

  /**
   * @private
   * @param {object} json Response object
   * @returns {object} Extended response
   */
  private _parseResponse(json: any) {
    if (json._embedded && json._embedded.records) {
      return this._toCollectionPage(json);
    }
    return this._parseRecord(json);
  }

  /**
   * @private
   * @param {object} json Response object
   * @returns {object} Extended response object
   */
  private _toCollectionPage(json: any): any {
    for (let i = 0; i < json._embedded.records.length; i += 1) {
      json._embedded.records[i] = this._parseRecord(json._embedded.records[i]);
    }
    return {
      records: json._embedded.records,
      next: async () => {
        const r = await this._sendNormalRequest(URI(json._links.next.href));
        return this._toCollectionPage(r);
      },
      prev: async () => {
        const r = await this._sendNormalRequest(URI(json._links.prev.href));
        return this._toCollectionPage(r);
      },
    };
  }

  /**
   * @private
   * @param {object} error Network error object
   * @returns {Promise<Error>} Promise that rejects with a human-readable error
   */
  private async _handleNetworkError(error: NetworkError): Promise<void> {
    if (error.response && error.response.status && error.response.statusText) {
      switch (error.response.status) {
        case 404:
          return Promise.reject(
            new NotFoundError(error.response.statusText, error.response.data)
          );
        default:
          return Promise.reject(
            new NetworkError(error.response.statusText, error.response.data)
          );
      }
    } else {
      return Promise.reject(new Error(error.message));
    }
  }
}
