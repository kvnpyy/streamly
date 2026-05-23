/* noop EIP-1193-shaped stub — Safari/extensions sometimes touch window.ethereum without checks */
(function () {
  try {
    if (typeof window === "undefined") return;
    if (window.ethereum) return;
    var n = {
      selectedAddress: null,
      chainId: null,
      isMetaMask: false,
      providers: [],
      request: function () {
        return Promise.reject(new Error("No Ethereum provider"));
      },
      on: function () {},
      removeListener: function () {},
      removeAllListeners: function () {},
    };
    Object.defineProperty(window, "ethereum", {
      value: n,
      writable: true,
      configurable: true,
    });
  } catch {}
})();
