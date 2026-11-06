#!/usr/bin/env bash
# Remove everything deploy.sh created, in the reverse order.
#
# Usage:
#   ./deploy/teardown.sh [region] [profile]

set -euo pipefail

REGION="${1:-us-east-1}"
PROFILE_ARG=()
if [ "$#" -ge 2 ]; then
  PROFILE_ARG=(--profile "$2")
fi

FUNCTION_NAME="${FUNCTION_NAME:-repo-demo}"
ROLE_NAME="${ROLE_NAME:-repo-demo-role}"

echo "==> removing the function URL"
aws lambda delete-function-url-config "${PROFILE_ARG[@]}" \
  --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null || true

echo "==> removing the function"
aws lambda delete-function "${PROFILE_ARG[@]}" \
  --function-name "$FUNCTION_NAME" --region "$REGION" 2>/dev/null || true

echo "==> removing the log group"
aws logs delete-log-group "${PROFILE_ARG[@]}" \
  --log-group-name "/aws/lambda/${FUNCTION_NAME}" --region "$REGION" 2>/dev/null || true

echo "==> detaching and removing the role"
aws iam detach-role-policy "${PROFILE_ARG[@]}" \
  --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>/dev/null || true
aws iam delete-role "${PROFILE_ARG[@]}" --role-name "$ROLE_NAME" 2>/dev/null || true

echo "Done."
