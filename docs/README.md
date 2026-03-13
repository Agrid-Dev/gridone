# Gridone Docs

Documentation site built with [MkDocs](https://www.mkdocs.org/) and the [Material theme](https://squidfunk.github.io/mkdocs-material/).

## Setup

Install dependencies (from this directory):

```sh
uv sync
```

## Local development

```sh
uv run mkdocs serve
# Opens at http://127.0.0.1:8000
```

## Build

```sh
uv run mkdocs build
# Output in docs/site/
```

## Deploy

The site is deployed to [docs.gridone.a-grid.com](https://docs.gridone.a-grid.com).

Build the static site and upload `site/` to your hosting provider:

```sh
uv run mkdocs build
```

## Structure

```
docs/
├── mkdocs.yml      # Site configuration and nav
├── pyproject.toml  # Python deps (mkdocs + material)
└── src/            # Markdown source files
    └── index.md    # Home page
```

Add new pages by creating `.md` files under `src/` and registering them in `mkdocs.yml` under `nav`.
