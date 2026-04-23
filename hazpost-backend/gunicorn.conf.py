import os

bind = f'0.0.0.0:{os.getenv("PORT", "6000")}'
workers = 1
threads = 4
worker_class = 'sync'
timeout = 120
keepalive = 5
loglevel = 'info'
accesslog = '-'
errorlog = '-'
