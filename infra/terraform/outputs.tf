output "vpc_id" {
  value = aws_vpc.main.id
}

output "rds_endpoint" {
  value     = aws_db_instance.postgres.address
  sensitive = true
}

output "documents_bucket" {
  value = aws_s3_bucket.documents.bucket
}

output "documents_sensitive_bucket" {
  value = aws_s3_bucket.documents_sensitive.bucket
}

output "db_credentials_secret_arn" {
  value = aws_secretsmanager_secret.db_credentials.arn
}
