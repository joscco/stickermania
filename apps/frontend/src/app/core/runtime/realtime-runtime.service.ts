import {Injectable} from "@angular/core";
import type {ClientToServerMessage, ServerToClientMessage} from "@birthday/shared";
import {WebSocketService, type WsConnectionStatus} from "../realtime/websocket.service";
import {AppRuntimeService} from "./app-runtime.service";
import {LocalRealtimeRuntimeService} from "./local/local-realtime-runtime.service";

@Injectable({providedIn: "root"})
export class RealtimeRuntimeService {
  public constructor(
    private readonly appRuntime: AppRuntimeService,
    private readonly remote: WebSocketService,
    private readonly localRuntime: LocalRealtimeRuntimeService,
  ) {}

  public get status() {
    return this.delegate().status;
  }

  public get wasConnected() {
    return this.delegate().wasConnected;
  }

  public get externalPickerActive() {
    return this.delegate().externalPickerActive;
  }

  public connect(): void {
    this.delegate().connect();
  }

  public disconnect(): void {
    this.delegate().disconnect();
  }

  public send(msg: ClientToServerMessage): void {
    this.delegate().send(msg);
  }

  public updatePendingJoin(msg: ClientToServerMessage): void {
    this.delegate().updatePendingJoin(msg);
  }

  public setExternalPickerActive(active: boolean): void {
    this.delegate().setExternalPickerActive(active);
  }

  public onMessage(listener: (msg: ServerToClientMessage) => void): () => void {
    return this.delegate().onMessage(listener);
  }

  private delegate(): WebSocketService | LocalRealtimeRuntimeService {
    return this.appRuntime.usesLocalBrowserGame() ? this.localRuntime : this.remote;
  }
}

export type {WsConnectionStatus};
