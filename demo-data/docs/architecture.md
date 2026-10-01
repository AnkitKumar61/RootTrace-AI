# ShopFlow architecture

ShopFlow is a fictional checkout backend. auth-service owns sessions, checkout-service coordinates purchases, payment-service authorizes sandbox payments, and inventory-service reserves stock. Each service emits a shared traceId for related work.

# Dependencies

checkout-service uses MongoDB for orders. inventory-service has a separate database. payment-service calls a fictional external gateway. auth-service checks issuer and audience metadata. Failure of one dependency can propagate to the checkout request.

# Healthy baseline

Normal checkout completes in under 500ms. Payment authorization normally takes 80ms. Health check success outside an incident window cannot establish availability during a failure.
