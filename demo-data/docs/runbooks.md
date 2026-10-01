# Database connection pool exhaustion

checkout-service uses a MongoDB connection pool capped at 20 connections. A growing waiting queue with active=20 and idle=0 followed by MongoWaitQueueTimeoutError indicates pool pressure. Check long-running queries and connection leaks before increasing maxPoolSize. Compare pool metrics to database request rates; the log alone does not prove a leak.

# Payment gateway timeout

payment-service connects to the sandbox gateway with a 5000ms connect timeout. Pending TCP connection and ETIMEDOUT point to gateway connectivity, DNS, or an unavailable upstream. Compare gateway health from the incident window and check network access before changing timeout values. checkout-service maps dependency failures to 502.

# Authentication audience configuration

auth-service validates a token audience matching the client configuration. ShopFlow browser sessions use shopflow-web. A deployment switching the expected audience to shopflow-v2 without updating token issuers rejects existing sessions with JwtAudienceMismatch and 401. Compare issuer and audience settings; never paste signing keys into logs.

# Inventory reservation unavailable

inventory-service readiness depends on its database connection. ECONNREFUSED with readiness=false prevents reservation and yields 503. Verify database availability and connection configuration, then inspect recovery logs. Low stock warnings do not indicate a database outage.

# Slow order history query

checkout-service /orders/history filters orders by customerId and sorts by createdAt. COLLSCAN and high docsExamined cause latency at larger data volumes. Inspect explain output and verify the compound customerId/createdAt index before proposing an index change. A 504 is a symptom of the latency budget, not the primary cause.
