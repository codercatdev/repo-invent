resource "aws_dynamodb_table" "orders" {
  name         = "orders"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "orderId"

  attribute {
    name = "sessionId"
    type = "S"
  }
}

resource "aws_lambda_function" "api" {
  function_name = "orders-api"
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  filename      = "dist.zip"
  role          = aws_iam_role.lambda_role.arn
  memory_size   = 512
  timeout       = 20
}

resource "aws_iam_role" "lambda_role" {
  name = "orders-api-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "orders" {
  name = "orders"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "*"
      Resource = "*"
    }]
  })
}

resource "aws_apigatewayv2_api" "http" {
  name          = "repo-invent-demo"
  protocol_type = "HTTP"
}
