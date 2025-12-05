# Gridone API server

A http server running the `gridone-api` package.

## Development

```sh
fastapi dev main.py
# or
uvicorn main:app --reload --reload-dir ../../packages/api # to reload when updating the api package

curl localhost:8000/devices | jq
```
