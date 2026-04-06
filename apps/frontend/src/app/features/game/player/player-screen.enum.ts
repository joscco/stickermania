/**
 * Every distinct screen a player (phone) can be on.
 *
 * In normal play the current screen is derived from the live store state.
 * In mock/screenshot mode it can be forced via the `?screen=` query param.
 */
export enum PlayerScreen {
    CONNECTING          = 'connecting',
    RECONNECTING        = 'reconnecting',
    DISCONNECTED        = 'disconnected',
    LOBBY_NAME          = 'lobby-name',
    LOBBY_AVATAR        = 'lobby-avatar',
    LOBBY_WAITING       = 'lobby-waiting',
    BUILDING            = 'building',
    BUILDING_SUBMITTED  = 'building-submitted',
    BUILDING_SKIPPED    = 'building-skipped',
    VOTING              = 'voting',
    RESULTS             = 'results',
    NEXT_ROUND          = 'next-round',
}

/** Every distinct screen visible on the board (TV / big display). */
export enum BoardScreen {
    LOBBY       = 'board-lobby',
    BUILDING    = 'board-building',
    VOTING      = 'board-voting',
    RESULTS     = 'board-results',
}

/** Union of all screen identifiers used in the screenshot script. */
export type AnyScreen = PlayerScreen | BoardScreen;

/** All screens in the order they appear during a session. */
export const ALL_PLAYER_SCREENS: PlayerScreen[] = [
    PlayerScreen.CONNECTING,
    PlayerScreen.RECONNECTING,
    PlayerScreen.DISCONNECTED,
    PlayerScreen.LOBBY_NAME,
    PlayerScreen.LOBBY_AVATAR,
    PlayerScreen.LOBBY_WAITING,
    PlayerScreen.BUILDING,
    PlayerScreen.BUILDING_SUBMITTED,
    PlayerScreen.BUILDING_SKIPPED,
    PlayerScreen.VOTING,
    PlayerScreen.RESULTS,
    PlayerScreen.NEXT_ROUND,
];

export const ALL_BOARD_SCREENS: BoardScreen[] = [
    BoardScreen.LOBBY,
    BoardScreen.BUILDING,
    BoardScreen.VOTING,
    BoardScreen.RESULTS,
];
