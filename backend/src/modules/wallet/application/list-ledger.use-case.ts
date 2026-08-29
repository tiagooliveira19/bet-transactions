import { Injectable } from "@nestjs/common";
import { WalletNotFoundError } from "../../../shared/domain/errors";
import { MoneyProps } from "../../../shared/domain/money";
import { UnitOfWork } from "../../persistence/unit-of-work";
import { LedgerDirection } from "../../../shared/domain/ledger-direction";

export interface LedgerItem {
  id: string;
  transactionId: string;
  direction: LedgerDirection;
  money: MoneyProps;
  balanceBefore: MoneyProps;
  balanceAfter: MoneyProps;
  createdAt: string;
}

export interface LedgerPage {
  items: LedgerItem[];
  nextCursor?: string;
}

@Injectable()
export class ListLedgerUseCase {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  execute(walletId: string, cursor: string | undefined, limit: number): Promise<LedgerPage> {
    return this.unitOfWork.run(async (ctx) => {
      const wallet = await ctx.findWalletById(walletId);
      if (!wallet) {
        throw new WalletNotFoundError();
      }
      const decoded = decodeCursor(cursor);
      const entries = await ctx.findLedgerByWallet(walletId, limit + 1, decoded);
      const hasMore = entries.length > limit;
      const page = hasMore ? entries.slice(0, limit) : entries;
      const last = page[page.length - 1];
      return {
        items: page.map((entry) => ({
          id: entry.id,
          transactionId: entry.transactionId,
          direction: entry.direction,
          money: entry.money.toJSON(),
          balanceBefore: entry.balanceBefore.toJSON(),
          balanceAfter: entry.balanceAfter.toJSON(),
          createdAt: entry.createdAt.toISOString(),
        })),
        nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : undefined,
      };
    });
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ t: createdAt.toISOString(), id }), "utf8").toString(
    "base64url",
  );
}

function decodeCursor(cursor?: string): { createdAt: Date; id: string } | undefined {
  if (!cursor) {
    return undefined;
  }
  const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
    t: string;
    id: string;
  };
  return { createdAt: new Date(parsed.t), id: parsed.id };
}
