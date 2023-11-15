/*
 * Copyright Fastly, Inc.
 * Licensed under the MIT license. See LICENSE file for details.
 */

export default class StreamerState {
  bufferedString: string;
  postponedString: string | undefined = undefined;

  constructor(initialValue?: string) {
    this.bufferedString = initialValue ?? '';
  }

  applyPostponedXmlString() {
    if (this.postponedString != null) {
      this.bufferedString += this.postponedString;
      this.postponedString = undefined;
    }
  }
  append(str: string) {
    this.applyPostponedXmlString();
    this.bufferedString += str;
  }
}
