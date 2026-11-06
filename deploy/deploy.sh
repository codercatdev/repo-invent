#!/usr/bin/env bash
# One-command deploy of the repo:Invent web demo to AWS Lambda + Function URL.
#
# Needs an AWS account with credentials configured in this terminal
# (`aws configure` or `aws sso login`). Nothing here reads a credential file.
#
# Usage:
#   ./deploy/deploy.sh [region] [profile]
#
# What it creates:
#   - a Lambda function (Node 22, 256 MB, 30 s timeout)
#   - a public Function URL with CORS for arbitrary origins
#   - one CloudWatch log group, 7-day retention
#
# Cost: a Function URL on a demo volume is a few cents a month. It is not free,
# and it is your account.

set -euo pipefail

REGION="${1:-us-east-1}"
PROFILE_ARG=()
if [[ $# -ge 2 ]]; then
  PROFILE_ARG=(--profile "$2")
fi

FUNCTION_NAME="${REPO_INVENT_FUNCTION:-repo-invent-demo}"
ROLE_NAME="${REPO_INVENT_ROLE:-repo-invent-demo-role}"
RUNTIME="nodejs22.x"
HANDLER="dist/lambda.handler"
ZIP_PATH="deploy/repo-invent-demo.zip"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

command -v aws >/dev/null || { echo "aws CLI not found on PATH" >&2; exit 1; }
command -v node >/dev/null || { echo "node not found on PATH" >&2; exit 1; }

echo "==> building"
npm run build >/dev/null

echo "==> packaging"
rm -f "$ZIP_PATH"
# The compiled output, its runtime dependencies, the static page, and the
# bundled data files. Never the sources or the tests.
zip -qr "$ZIP_PATH" dist node_modules package.json web data \
  -x "node_modules/.bin/*" "node_modules/**/test/*" "node_modules/**/*.md"

ACCOUNT_ID="$(aws sts get-caller-identity "${PROFILE_ARG[@]}" --query Account --output text)"

echo "==> ensuring the execution role"
if ! aws iam get-role "${PROFILE_ARG[@]}" --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  aws iam create-role "${PROFILE_ARG[@]}" \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST" >/dev/null
  aws iam attach-role-policy "${PROFILE_ARG[@]}" \
    --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole >/dev/null
  echo "    created $ROLE_NAME; waiting for it to propagate"
  sleep 12
else
  echo "    $ROLE_NAME already exists"
fi
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

echo "==> shipping the function"
if aws lambda get-function "${PROFILE_ARG[@]}" --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  # One update at a time: Lambda refuses a second update while the first is in
  # progress, and the handler and runtime do not change between deploys.
  aws lambda update-function-code "${PROFILE_ARG[@]}" \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_PATH" \
    --region "$REGION" >/dev/null
  aws lambda wait function-updated "${PROFILE_ARG[@]}" \
    --function-name "$FUNCTION_NAME" --region "$REGION"
else
  aws lambda create-function "${PROFILE_ARG[@]}" \
    --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" \
    --handler "$HANDLER" \
    --role "$ROLE_ARN" \
    --zip-file "fileb://$ZIP_PATH" \
    --timeout 30 \
    --memory-size 256 \
    --region "$REGION" >/dev/null
fi

echo "==> waiting for the function to be active"
aws lambda wait function-active "${PROFILE_ARG[@]}" \
  --function-name "$FUNCTION_NAME" --region "$REGION"

echo "==> ensuring the public Function URL"
if ! aws lambda get-function-url-config "${PROFILE_ARG[@]}" \
  --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  aws lambda create-function-url-config "${PROFILE_ARG[@]}" \
    --function-name "$FUNCTION_NAME" \
    --auth-type NONE \
    --cors '{"AllowOrigins":["*"],"AllowMethods":["GET","POST"],"AllowHeaders":["content-type"]}' \
    --region "$REGION" >/dev/null
  aws lambda add-permission "${PROFILE_ARG[@]}" \
    --function-name "$FUNCTION_NAME" \
    --statement-id public-url \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE \
    --region "$REGION" >/dev/null
fi

echo "==> log retention"
aws logs create-log-group "${PROFILE_ARG[@]}" \
  --log-group-name "/aws/lambda/${FUNCTION_NAME}" --region "$REGION" 2>/dev/null || true
aws logs put-retention-policy "${PROFILE_ARG[@]}" \
  --log-group-name "/aws/lambda/${FUNCTION_NAME}" --retention-in-days 7 --region "$REGION" 2>/dev/null || true

URL="$(aws lambda get-function-url-config "${PROFILE_ARG[@]}" \
  --function-name "$FUNCTION_NAME" --region "$REGION" --query FunctionUrl --output text)"

echo
echo "Deployed."
echo "  URL: $URL"
echo "  Function: $FUNCTION_NAME ($REGION)"
echo
echo "Smoke test:"
echo "  curl -s '${URL}health'"
echo
echo "To remove everything:"
echo "  ./deploy/teardown.sh $REGION ${2:-}"
