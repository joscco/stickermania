export type CommandHandler<TCommand> = (command: TCommand) => void;

export type CommandResult<TCommand> = TCommand | TCommand[] | null | undefined;

export class CommandDispatcher<TCommand> {
  constructor(private readonly handleCommand: CommandHandler<TCommand>) {}

  dispatch(command: TCommand): void {
    this.handleCommand(command);
  }

  dispatchMany(commands: TCommand[]): void {
    for (const command of commands) {
      this.dispatch(command);
    }
  }

  dispatchResult(result: CommandResult<TCommand>): void {
    if (!result) {
      return;
    }

    if (Array.isArray(result)) {
      this.dispatchMany(result);
      return;
    }

    this.dispatch(result);
  }
}

export function commandResult<TCommand>(
  command: CommandResult<TCommand>,
): CommandResult<TCommand> {
  return command;
}
