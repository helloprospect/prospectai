-- Industry Benchmarks
-- Replace these with your actual performance data from existing campaigns.
-- These are placeholder values — load your real data here.

INSERT INTO industry_benchmarks (industry, avg_open_rate, avg_reply_rate, top_decile_reply_rate, sample_size)
VALUES
    ('saas',                    0.38, 0.055, 0.12, 0),
    ('ecommerce',               0.31, 0.032, 0.08, 0),
    ('agency',                  0.35, 0.048, 0.10, 0),
    ('professional_services',   0.33, 0.041, 0.09, 0),
    ('manufacturing',           0.29, 0.028, 0.07, 0),
    ('fintech',                 0.36, 0.051, 0.11, 0),
    ('healthtech',              0.34, 0.044, 0.10, 0),
    ('logistics',               0.30, 0.033, 0.08, 0),
    ('real_estate',             0.32, 0.038, 0.09, 0),
    ('general',                 0.32, 0.040, 0.09, 0)
ON CONFLICT (industry) DO UPDATE SET
    avg_open_rate = EXCLUDED.avg_open_rate,
    avg_reply_rate = EXCLUDED.avg_reply_rate,
    top_decile_reply_rate = EXCLUDED.top_decile_reply_rate,
    updated_at = NOW();
