#!/bin/sh
set -eu

ENDPOINT="${AWS_ENDPOINT_URL:-http://localhost:4566}"
REGION="${AWS_REGION:-us-east-1}"

create_fifo() {
  name="$1"
  extra="${2:-}"
  aws --endpoint-url="$ENDPOINT" --region "$REGION" \
    sqs create-queue \
    --queue-name "$name" \
    --attributes "FifoQueue=true,ContentBasedDeduplication=false${extra}"
}

create_fifo "wager-transactions-dlq.fifo"
DLQ_URL=$(aws --endpoint-url="$ENDPOINT" --region "$REGION" sqs get-queue-url --queue-name wager-transactions-dlq.fifo --query QueueUrl --output text)
DLQ_ARN=$(aws --endpoint-url="$ENDPOINT" --region "$REGION" sqs get-queue-attributes --queue-url "$DLQ_URL" --attribute-names QueueArn --query Attributes.QueueArn --output text)

create_fifo "wager-transactions.fifo" ",RedrivePolicy={\"deadLetterTargetArn\":\"${DLQ_ARN}\",\"maxReceiveCount\":\"5\"}"
create_fifo "wallet-events.fifo"

echo "SQS FIFO queues ready"
