# Checkout API

POST /checkout creates an order after payment authorization and inventory reservation. Responses: 201 success, 502 payment dependency failure, 503 database or inventory unavailable. GET /orders/history may return 504 when the latency budget is exceeded.

# Authentication API

POST /login issues a session for audience shopflow-web. Protected APIs return 401 when issuer/audience validation fails. Configuration changes must keep issuer and audience consistent.

# Dependency APIs

payment-service POST /authorize can return 504 for gateway connection timeouts. inventory-service POST /reserve can return 503 while readiness=false. Callers should preserve traceId when reporting dependency failures.
