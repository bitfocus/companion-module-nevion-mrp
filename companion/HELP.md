## Nevion Videohubs

Module to control various Nevion Videohubs via the closed MRP protocol. It reads the number of inputs and outputs from the unit and is based around the functionality in the BMD Videohub module.

(Be aware this is based on reverse-engineered commands)

**Suppoted Models:**
* All Nevion Videohubs, from small to big :)

**Availble commands for Nevion VikinX Routers**
* Route: type `d` as the source to disconnect the output, on levels that support disconnect
* Select_destination
* Route_source
* Take
* Clear

**Reading the router**
After connecting, the module reads every level's inputs, outputs, signal presence and crosspoints. It publishes the inputs and outputs in its actions, presets and variables once that read is complete, not one at a time. The variable `first_load_complete` is `false` from the connect until then, and `true` after it. If the router has not answered everything within the *Initial read timeout* (30 seconds by default), the module logs a warning, publishes what it has read and sets `first_load_complete` to `true`. A disconnect sets it back to `false` until the router has been read again.

**Supported Feedback**
* Feedback for all actions mentioned above

**Supported Presets**
* Auto gen presets for all commands based on size and number of layers