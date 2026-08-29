import { hashPayload } from "../../../shared/domain/canonical-json";
import { MoneyProps } from "../../../shared/domain/money";
import { WagerTransactionKind } from "../domain/wager-transaction";

export interface BusinessPayload {
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: MoneyProps;
  referenceExternalTransactionId?: string;
}

export function hashBusinessPayload(payload: BusinessPayload): string {
  return hashPayload({
    providerId: payload.providerId,
    externalTransactionId: payload.externalTransactionId,
    playerId: payload.playerId,
    walletId: payload.walletId,
    roundId: payload.roundId,
    gameId: payload.gameId,
    kind: payload.kind,
    money: payload.money,
    referenceExternalTransactionId: payload.referenceExternalTransactionId,
  });
}
