# Gridone CLI

A command line interface for to interact with gridone core, built with [typer](https://typer.tiangolo.com/).

## Usage

Requires having a file db setup under ".db" at the root of the repo.
Some command examples for a device with id "my_thermostat":

```sh
gridone --help
gridone devices read my_thermostat
gridone devices write my_thermostat temperature_setpoint 21
gridone devices write my_thermostat state 1
gridone devices watch my_thermostat
```
