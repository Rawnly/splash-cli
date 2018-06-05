require("babel-polyfill");

import fs from "fs";
import path from "path";
import https from "https";
import {
  userInfo,
  homedir
} from "os";

import randomFrom from "lodash/sample";
import clear from "clear";
import chalk from "chalk";
import mkdirp from "mkdirp";
import frun from "first-run";
import inquirer from "inquirer";
import wallpaper from "wallpaper";
import fetch from "isomorphic-fetch";
import isMonth from "@splash-cli/is-month";
import updateNotifier from "update-notifier";
import pathFixer from "@splash-cli/path-fixer";
import printBlock from "@splash-cli/print-block";
import parseID from "@splash-cli/parse-unsplash-id";

import Conf from "conf";
import Ora from "ora";

import {
  toJson
} from "unsplash-js";

import commands from "./commands/index";
import {
  defaultSettings,
  unsplash
} from "./extra/config";
import {
  download,
  picOfTheDay,
  errorHandler,
  clearSettings,
  parseCollection
} from "./extra/utils";

import manifest from "../package.json";

const config = new Conf({
  defaults: defaultSettings
});

const {
  photos: {
    getRandomPhoto,
    getPhoto,
    listCuratedPhotos,
    downloadPhoto
  },
  collections: {
    getCollection,
    getCuratedCollection,
    getCollectionPhotos,
    getCuratedCollectionPhotos
  }
} = unsplash;

const spinner = new Ora({
  color: "yellow",
  spinner: isMonth("december") ? "christmas" : "earth"
});

export default async function (input, flags) {
  const [command, ...subCommands] = input;
  const {
    quiet,
    save
  } = flags;
  const options = {};

  // Parse commands
  for (let i = 0; i < subCommands.length; i += 1) {
    options[subCommands[i]] = subCommands[i];
  }

  if (flags.quiet) {
    console.log = console.info = () => {};
    spinner.start = spinner.fail = () => {};
  }

  if (!config.get("directory") || !config.has("directory")) {
    config.set("directory", pathFixer("~/Pictures/splash_photos"));
  }

  if (fs.existsSync(config.get("directory"))) {
    mkdirp(config.get("directory"), error => {
      if (error) return errorHandler(error);
    });
  }

  updateNotifier({
    pkg: manifest,
    updateCheckInterval: 1000 * 30
  }).notify();

  if (frun()) {
    const settingsCleared = await clearSettings();

    printBlock(
      chalk `Welcome to ${manifest.name}@${manifest.version} {bold @${
        userInfo().username
      }}`,
      chalk `{dim Application setup {green completed}!}`,
      chalk `{bold Enjoy "{yellow ${manifest.name}}" running {green splash}}`
    );

    console.log();

    return;
  }

  if (!command) {
    clear();

    spinner.start("Connecting to Unsplash");

    try {
      let photo = false;

      if (flags.day) {
        const response = await getPhoto(await picOfTheDay());
        photo = await response.json();
      } else if (flags.curated) {
        const response = await listCuratedPhotos();
        const photos = await response.json();

        photo = randomFrom(photos);
      } else if (flags.id && parseID(flags.id)) {
        const response = await getPhoto(parseID(flags.id));
        photo = await response.json();
      } else {
        if (flags.id) {
          spinner.warn = chalk `Invalid ID: "{yellow ${flags.id}}"`;
        }
        const response = await getRandomPhoto({
          query: flags.query,
          username: flags.user,
          featured: Boolean(flags.featured),
          collections: flags.collection ? (flags.collection.includes(',') ? flags.collection.split(',').map(parseCollection) : [parseCollection(flags.collection)]) : undefined,
          count: 1
        });

        photo = await response.json();
      }

      if (photo) {
        spinner.succeed("Connected!");

        if (Array.isArray(photo)) {
          photo = photo[0];
        }

        if (photo.errors) {
          printBlock(chalk `{bold {red ERROR:}}`, ...photo.errors);
          return;
        }

        const res = await downloadPhoto(photo);
        const {
          url
        } = await res.json();
        const downloaded = await download(photo, url, flags, true);
      } else {
        spinner.fail("Unable to connect.");
      }
    } catch (error) {
      spinner.fail();
      return errorHandler(error);
    }
  } else {
    clear();
    console.log();

    switch (command) {
      case "settings":
        return commands.settings(subCommands);
        break;
      case "alias":
        return commands.alias(subCommands);
        break;
      default:
        printBlock(
          chalk `{bold {red Error}}: "{yellow ${command}}" is not a {dim splash} command.`,
          ``,
          chalk `See {dim splash --help}`
        );
        break;
    }
  }
}