// app.js - VinMonDice dApp logic (Swap & Dice)
// Network: Monad (chainId 143)
// VINTokenV2: 0xfB71cbd8CB6f0fb72a9568f11e7E4454309A9cA1
// Swap V2:    0x11395DB7E0AcB7c56fE79FBAFFD48B5BeC896098
// Dice V2:    0x245Fb6ECC6B2beCaf45AC15E4fAc8C78826f0F67

(() => {
  "use strict";

  // ===== Constants =====
  const RPC_URL = "https://rpc.monad.xyz";
  const MONAD_CHAIN_ID_DEC = 143;
  const MONAD_CHAIN_ID_HEX = "0x8f"; // 143 in hex

  const VIN_TOKEN_ADDRESS = "0xfB71cbd8CB6f0fb72a9568f11e7E4454309A9cA1";
  const SWAP_CONTRACT_ADDRESS = "0x11395DB7E0AcB7c56fE79FBAFFD48B5BeC896098";
  const DICE_CONTRACT_ADDRESS = "0x245Fb6ECC6B2beCaf45AC15E4fAc8C78826f0F67";

  const VIN_DECIMALS = 18;

  // ===== ABIs (shortened to needed functions) =====
  const VIN_TOKEN_ABI = [
    {
      constant: true,
      inputs: [{ name: "account", type: "address" }],
      name: "balanceOf",
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function"
    },
    {
      constant: true,
      inputs: [],
      name: "decimals",
      outputs: [{ name: "", type: "uint8" }],
      stateMutability: "view",
      type: "function"
    },
    {
      constant: true,
      inputs: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" }
      ],
      name: "allowance",
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function"
    },
    {
      constant: false,
      inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" }
      ],
      name: "approve",
      outputs: [{ name: "", type: "bool" }],
      stateMutability: "nonpayable",
      type: "function"
    }
  ];

  // Swap MON <-> VIN (1:1)
  const SWAP_ABI = [
    {
      inputs: [],
      name: "getMonReserve",
      outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [],
      name: "getVinReserve",
      outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [{ internalType: "uint256", name: "amountVin", type: "uint256" }],
      name: "swapVinToMon",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function"
    },
    {
      inputs: [],
      name: "swapMonToVin",
      outputs: [],
      stateMutability: "payable",
      type: "function"
    }
  ];

  // Dice ABI (VinMonDiceV2)
  const DICE_ABI = [
    {
      inputs: [],
      name: "MIN_BET",
      outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [],
      name: "getMaxBet",
      outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [],
      name: "getBankBalance",
      outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [],
      name: "getLastResultByPlayer",
      outputs: [
        { internalType: "uint256", name: "amount", type: "uint256" },
        { internalType: "bool", name: "choiceEven", type: "bool" },
        { internalType: "bool", name: "resultEven", type: "bool" },
        { internalType: "bool", name: "won", type: "bool" },
        { internalType: "uint256", name: "payout", type: "uint256" },
        { internalType: "bytes32", name: "serverSeedHash", type: "bytes32" },
        { internalType: "bytes32", name: "clientSeed", type: "bytes32" },
        { internalType: "uint256", name: "blockNumber", type: "uint256" },
        { internalType: "uint256", name: "randomNumber", type: "uint256" }
      ],
      stateMutability: "view",
      type: "function"
    },
    {
      inputs: [
        { internalType: "uint256", name: "amount", type: "uint256" },
        { internalType: "uint8", name: "choice", type: "uint8" },
        { internalType: "bytes32", name: "clientSeed", type: "bytes32" }
      ],
      name: "play",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function"
    },
    {
      anonymous: false,
      inputs: [
        { indexed: true, internalType: "address", name: "player", type: "address" },
        { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
        { indexed: false, internalType: "uint8", name: "choice", type: "uint8" },
        { indexed: false, internalType: "uint8", name: "result", type: "uint8" },
        { indexed: false, internalType: "bool", name: "won", type: "bool" },
        { indexed: false, internalType: "uint256", name: "payout", type: "uint256" }
      ],
      name: "Played",
      type: "event"
    }
  ];

  // ===== Global state =====
  let web3Provider = null; // window.ethereum provider
  let rpcProvider = null; // read-only provider
  let signer = null;
  let currentAccount = null;

  // Read-only contracts
  let vinRead = null;
  let swapRead = null;
  let diceRead = null;

  // Write contracts
  let vinWrite = null;
  let swapWrite = null;
  let diceWrite = null;

  // Dice state
  let diceMinBetBN = null;
  let diceMaxBetBN = null;
  let diceAllowanceBN = null;
  let lastDiceGame = null;
  let lastDiceBetBN = null;
  let diceGuessEven = true; // true = EVEN, false = ODD

  // Swap state
  let swapDirection = "vinToMon"; // "vinToMon" or "monToVin"

  // ===== Helpers =====
  function $(id) {
    return document.getElementById(id);
  }

  function shortenAddress(addr) {
    if (!addr) return "-";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function formatUnitsSafe(bn, decimals, precision = 4, withGrouping = false) {
    try {
      if (!bn) return "0";
      const str = ethers.utils.formatUnits(bn, decimals);
      const num = Number(str);
      if (!Number.isFinite(num)) return "0";
      if (withGrouping) {
        return num.toLocaleString(undefined, {
          maximumFractionDigits: precision,
          minimumFractionDigits: 0
        });
      }
      return num.toFixed(precision);
    } catch (err) {
      return "0";
    }
  }

  function parseUnitsSafe(str, decimals) {
    if (!str) return null;
    const trimmed = String(str).trim();
    if (!trimmed) return null;
    if (!/^[0-9]*[.,]?[0-9]*$/.test(trimmed)) return null;
    const normalized = trimmed.replace(",", ".");
    try {
      return ethers.utils.parseUnits(normalized, decimals);
    } catch {
      return null;
    }
  }

  function formatVinDisplay(bn, precision = 6) {
    return formatUnitsSafe(bn, VIN_DECIMALS, precision, true);
  }

  function formatVinPlain(bn, precision = 4) {
    return formatUnitsSafe(bn, VIN_DECIMALS, precision, false);
  }

  function formatMonPlain(bn, precision = 4) {
    return formatUnitsSafe(bn, 18, precision, false);
  }

  function getRandomClientSeed() {
    const bytes = new Uint8Array(32);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < 32; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return ethers.utils.hexlify(bytes);
  }

  function extractRevertReason(err) {
    try {
      if (!err) return "";
      if (err.error && err.error.message) return err.error.message;
      if (err.data && err.data.message) return err.data.message;
      if (err.message) return err.message;
    } catch (e) {
      return "";
    }
    return "";
  }

  // ===== Providers & Contracts =====
  function initReadProvider() {
    if (!rpcProvider) {
      rpcProvider = new ethers.providers.JsonRpcProvider(RPC_URL, {
        name: "monad",
        chainId: MONAD_CHAIN_ID_DEC
      });
      vinRead = new ethers.Contract(VIN_TOKEN_ADDRESS, VIN_TOKEN_ABI, rpcProvider);
      swapRead = new ethers.Contract(SWAP_CONTRACT_ADDRESS, SWAP_ABI, rpcProvider);
      diceRead = new ethers.Contract(DICE_CONTRACT_ADDRESS, DICE_ABI, rpcProvider);
    }
  }

  function initWriteContracts() {
    if (!signer) return;
    vinWrite = new ethers.Contract(VIN_TOKEN_ADDRESS, VIN_TOKEN_ABI, signer);
    swapWrite = new ethers.Contract(SWAP_CONTRACT_ADDRESS, SWAP_ABI, signer);
    diceWrite = new ethers.Contract(DICE_CONTRACT_ADDRESS, DICE_ABI, signer);
  }

  function setNetworkStatus(isCorrect) {
    const el = $("homeNetwork");
    if (!el) return;
    if (!isCorrect) {
      el.textContent = "Wrong network";
      el.classList.add("status-error");
    } else {
      el.textContent = "Monad";
      el.classList.remove("status-error");
    }
  }

  async function ensureMonadNetwork() {
    if (!window.ethereum) {
      alert("No injected wallet found. Please install MetaMask or a compatible wallet.");
      return false;
    }
    try {
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (chainId === MONAD_CHAIN_ID_HEX) {
        setNetworkStatus(true);
        return true;
      }

      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: MONAD_CHAIN_ID_HEX }]
      });

      setNetworkStatus(true);
      return true;
    } catch (err) {
      console.error("ensureMonadNetwork error:", err);
      alert("Please switch your wallet to Monad network (chainId 143) and try again.");
      setNetworkStatus(false);
      return false;
    }
  }

  // ===== Navigation =====
  function showScreen(screenId) {
    const home = $("home-screen");
    const swap = $("swap-screen");
    const dice = $("dice-screen");

    if (home) home.classList.remove("screen-active");
    if (swap) swap.classList.remove("screen-active");
    if (dice) dice.classList.remove("screen-active");

    const target = $(screenId);
    if (target) target.classList.add("screen-active");

    const navHome = $("navHome");
    const navSwap = $("navSwap");
    const navDice = $("navDice");

    if (navHome && navSwap && navDice) {
      navHome.classList.remove("active");
      navSwap.classList.remove("active");
      navDice.classList.remove("active");

      if (screenId === "home-screen") navHome.classList.add("active");
      if (screenId === "swap-screen") navSwap.classList.add("active");
      if (screenId === "dice-screen") navDice.classList.add("active");
    }
  }

  function initNav() {
    const navHome = $("navHome");
    const navSwap = $("navSwap");
    const navDice = $("navDice");
    const goToSwap = $("goToSwap");
    const goToDice = $("goToDice");

    if (navHome) navHome.addEventListener("click", () => showScreen("home-screen"));
    if (navSwap) navSwap.addEventListener("click", () => showScreen("swap-screen"));
    if (navDice) navDice.addEventListener("click", () => showScreen("dice-screen"));

    if (goToSwap) goToSwap.addEventListener("click", () => showScreen("swap-screen"));
    if (goToDice) goToDice.addEventListener("click", () => showScreen("dice-screen"));
  }

  // ===== Balances =====
  async function refreshBalances() {
    try {
      initReadProvider();
      if (!currentAccount) {
        setText("homeWalletAddress", "Not connected");
        setText("homeVinBalance", "-");
        setText("homeMonBalance", "-");
        setText("diceWalletAddressShort", "Not connected");
        setText("diceVinBalance", "-");
        setText("diceMonBalance", "-");
        return;
      }

      const [vinBal, monBal, dicePoolVinBN] = await Promise.all([
        vinRead.balanceOf(currentAccount),
        rpcProvider.getBalance(currentAccount),
        diceRead.getBankBalance()
      ]);

      setText("homeWalletAddress", shortenAddress(currentAccount));
      setText("homeVinBalance", `${formatVinPlain(vinBal)} VIN`);
      setText("homeMonBalance", `${formatMonPlain(monBal)} MON`);
      setText("diceWalletAddressShort", shortenAddress(currentAccount));
      setText("diceVinBalance", `${formatVinPlain(vinBal)} VIN`);
      setText("diceMonBalance", `${formatMonPlain(monBal)} MON`);
      setText("homeDicePoolVin", `${formatVinPlain(dicePoolVinBN)} VIN`);
      setText("dicePoolVin", `${formatVinPlain(dicePoolVinBN)} VIN`);
    } catch (err) {
      console.error("refreshBalances error:", err);
    }
  }

  async function updateDicePool() {
    try {
      initReadProvider();
      const dicePoolVinBN = await diceRead.getBankBalance();
      setText("homeDicePoolVin", `${formatVinPlain(dicePoolVinBN)} VIN`);
      setText("dicePoolVin", `${formatVinPlain(dicePoolVinBN)} VIN`);
    } catch (err) {
      console.error("updateDicePool error:", err);
    }
  }

  async function updateDiceLimitsAndAllowance() {
    try {
      initReadProvider();
      const [minBet, maxBet] = await Promise.all([
        diceRead.MIN_BET(),
        diceRead.getMaxBet()
      ]);

      diceMinBetBN = minBet;
      diceMaxBetBN = maxBet;

      const minBetStr = formatVinDisplay(minBet);
      const maxBetStr = formatVinDisplay(maxBet, 4);

      setText(
        "diceMinInfo",
        `Minimum bet: ${minBetStr} VIN (2x payout on win)`
      );
      setText(
        "diceMinimumText",
        `Minimum bet is ${minBetStr} VIN. There is no fixed maximum bet, but a safe recommended limit is around ${maxBetStr} VIN based on the current bankroll.`
      );

      if (currentAccount) {
        const allowance = await vinRead.allowance(
          currentAccount,
          DICE_CONTRACT_ADDRESS
        );
        diceAllowanceBN = allowance;
        const allowanceStr = formatVinDisplay(allowance, 4);
        setText("diceAllowance", `${allowanceStr} VIN`);
      } else {
        setText("diceAllowance", "-");
      }
    } catch (err) {
      console.error("updateDiceLimitsAndAllowance error:", err);
      setText("diceMinInfo", "Minimum bet: N/A");
      setText("diceMinimumText", "Minimum / maximum bet: N/A");
    }
  }

  // ===== Swap Logic =====
  function getSwapInputElements() {
    return {
      fromAmountEl: $("swapFromAmount"),
      toAmountEl: $("swapToAmount"),
      fromBalanceLabel: $("fromBalanceLabel"),
      toBalanceLabel: $("toBalanceLabel"),
      actionButton: $("swapActionButton"),
      statusEl: $("swapStatus")
    };
  }

  function updateSwapDirectionUI() {
    const tabVinToMon = $("tabVinToMon");
    const tabMonToVin = $("tabMonToVin");
    const fromToken = $("swapFromToken");
    const toToken = $("swapToToken");
    const rateLabel = $("swapRateLabel");

    if (tabVinToMon && tabMonToVin) {
      tabVinToMon.classList.remove("active");
      tabMonToVin.classList.remove("active");
      if (swapDirection === "vinToMon") {
        tabVinToMon.classList.add("active");
      } else {
        tabMonToVin.classList.add("active");
      }
    }

    if (fromToken && toToken) {
      if (swapDirection === "vinToMon") {
        fromToken.textContent = "VIN";
        toToken.textContent = "MON";
      } else {
        fromToken.textContent = "MON";
        toToken.textContent = "VIN";
      }
    }

    if (rateLabel) {
      rateLabel.textContent =
        "1 VIN = 1 MON (fixed while pool has liquidity)";
    }
  }

  function updateSwapBalancesLabels(vinBal, monBal) {
    const { fromBalanceLabel, toBalanceLabel } = getSwapInputElements();
    if (!fromBalanceLabel || !toBalanceLabel) return;

    if (swapDirection === "vinToMon") {
      fromBalanceLabel.textContent = `Balance: ${formatVinPlain(vinBal)} VIN`;
      toBalanceLabel.textContent = `Balance: ${formatMonPlain(monBal)} MON`;
    } else {
      fromBalanceLabel.textContent = `Balance: ${formatMonPlain(monBal)} MON`;
      toBalanceLabel.textContent = `Balance: ${formatVinPlain(vinBal)} VIN`;
    }
  }

  async function refreshSwapBalancesLabels() {
    try {
      initReadProvider();
      if (!currentAccount) return;
      const [vinBal, monBal] = await Promise.all([
        vinRead.balanceOf(currentAccount),
        rpcProvider.getBalance(currentAccount)
      ]);
      updateSwapBalancesLabels(vinBal, monBal);
    } catch (err) {
      console.error("refreshSwapBalancesLabels error:", err);
    }
  }

  function recalcSwapOutput() {
    const { fromAmountEl, toAmountEl, statusEl } = getSwapInputElements();
    if (!fromAmountEl || !toAmountEl || !statusEl) return;

    const amountBN = parseUnitsSafe(
      fromAmountEl.value,
      swapDirection === "vinToMon" ? VIN_DECIMALS : 18
    );

    if (!amountBN || amountBN.lte(0)) {
      toAmountEl.value = "";
      statusEl.textContent = "Enter an amount to swap.";
      return;
    }

    const formatted = formatUnitsSafe(
      amountBN,
      swapDirection === "vinToMon" ? VIN_DECIMALS : 18,
      6,
      false
    );
    toAmountEl.value = formatted;
    statusEl.textContent = "";
  }

  async function handleSwapMax() {
    const { fromAmountEl } = getSwapInputElements();
    if (!fromAmountEl || !currentAccount) return;

    try {
      initReadProvider();
      if (swapDirection === "vinToMon") {
        const vinBal = await vinRead.balanceOf(currentAccount);
        fromAmountEl.value = formatVinPlain(vinBal, 6);
      } else {
        const monBal = await rpcProvider.getBalance(currentAccount);
        fromAmountEl.value = formatMonPlain(monBal, 6);
      }
      recalcSwapOutput();
    } catch (err) {
      console.error("handleSwapMax error:", err);
    }
  }

  async function handleSwapAction() {
    const { fromAmountEl, statusEl } = getSwapInputElements();
    if (!fromAmountEl || !statusEl) return;

    try {
      if (!currentAccount || !web3Provider || !signer) {
        alert("Please connect your wallet first.");
        return;
      }
      if (!(await ensureMonadNetwork())) return;

      initWriteContracts();
      initReadProvider();

      const amountBN = parseUnitsSafe(
        fromAmountEl.value,
        swapDirection === "vinToMon" ? VIN_DECIMALS : 18
      );
      if (!amountBN || amountBN.lte(0)) {
        statusEl.textContent = "Invalid amount.";
        return;
      }

      if (swapDirection === "vinToMon") {
        const vinBal = await vinRead.balanceOf(currentAccount);
        if (vinBal.lt(amountBN)) {
          statusEl.textContent = "Insufficient VIN balance.";
          alert("Insufficient VIN balance.");
          return;
        }

        statusEl.textContent = "Sending swap VIN → MON transaction...";
        const tx = await swapWrite.swapVinToMon(amountBN);
        const receipt = await tx.wait();
        if (receipt.status !== 1) {
          statusEl.textContent = "Swap VIN → MON transaction reverted.";
          return;
        }
        statusEl.textContent = "Swap VIN → MON successful.";
      } else {
        const monBal = await rpcProvider.getBalance(currentAccount);
        if (monBal.lt(amountBN)) {
          statusEl.textContent = "Insufficient MON balance.";
          alert("Insufficient MON balance.");
          return;
        }

        statusEl.textContent = "Sending swap MON → VIN transaction...";
        const tx = await swapWrite.swapMonToVin({ value: amountBN });
        const receipt = await tx.wait();
        if (receipt.status !== 1) {
          statusEl.textContent = "Swap MON → VIN transaction reverted.";
          return;
        }
        statusEl.textContent = "Swap MON → VIN successful.";
      }

      await Promise.all([refreshBalances(), refreshSwapBalancesLabels()]);
      recalcSwapOutput();
    } catch (err) {
      console.error("handleSwapAction error:", err);
      const reason = extractRevertReason(err);
      statusEl.textContent =
        "Swap failed on-chain. " + (reason ? `Reason: ${reason}` : "");
      alert(
        "Swap transaction failed on-chain.\n" +
          (reason ? `Reason: ${reason}` : "")
      );
    }
  }

  function initSwapEvents() {
    const tabVinToMon = $("tabVinToMon");
    const tabMonToVin = $("tabMonToVin");
    const fromAmountEl = $("swapFromAmount");
    const maxBtn = $("swapMaxButton");
    const actionBtn = $("swapActionButton");

    if (tabVinToMon) {
      tabVinToMon.addEventListener("click", () => {
        swapDirection = "vinToMon";
        updateSwapDirectionUI();
        refreshSwapBalancesLabels();
        recalcSwapOutput();
      });
    }

    if (tabMonToVin) {
      tabMonToVin.addEventListener("click", () => {
        swapDirection = "monToVin";
        updateSwapDirectionUI();
        refreshSwapBalancesLabels();
        recalcSwapOutput();
      });
    }

    if (fromAmountEl) {
      fromAmountEl.addEventListener("input", recalcSwapOutput);
    }
    if (maxBtn) {
      maxBtn.addEventListener("click", handleSwapMax);
    }
    if (actionBtn) {
      actionBtn.addEventListener("click", handleSwapAction);
    }

    updateSwapDirectionUI();
  }

  // ===== Dice Logic =====
  function getCurrentDiceChoice() {
    return diceGuessEven ? 0 : 1; // 0 = EVEN, 1 = ODD
  }

  function onGuessButtonClick(isEven) {
    diceGuessEven = isEven;
    const evenBtn = $("diceGuessEven");
    const oddBtn = $("diceGuessOdd");

    if (evenBtn && oddBtn) {
      if (isEven) {
        evenBtn.classList.add("active");
        oddBtn.classList.remove("active");
      } else {
        oddBtn.classList.add("active");
        evenBtn.classList.remove("active");
      }
    }
  }

  function getDiceBetAmountBN() {
    const input = $("diceBetAmount");
    if (!input) return null;
    return parseUnitsSafe(input.value, VIN_DECIMALS);
  }

  function setDiceBetAmountFromBN(bn) {
    const input = $("diceBetAmount");
    if (!input) return;
    input.value = formatVinPlain(bn, 6);
  }

  function setDiceVisual(resultEven) {
    const visual = $("diceVisual");
    if (!visual) return;

    const coinsWrapper = visual.querySelector(".dice-coins");
    if (!coinsWrapper) return;

    const coins = coinsWrapper.querySelectorAll(".dice-coin");
    if (!coins || coins.length === 0) return;

    // Helper: apply pattern like ["white", "red", "white", "white"]
    function applyPattern(pattern) {
      pattern.forEach((color, idx) => {
        const coin = coins[idx];
        if (!coin) return;
        coin.classList.remove("dice-coin-white", "dice-coin-red");
        if (color === "white") {
          coin.classList.add("dice-coin-white");
        } else {
          coin.classList.add("dice-coin-red");
        }
      });
    }

    // Default state before a result
    if (resultEven === null || resultEven === undefined) {
      const defaultPattern = ["white", "red", "white", "red"];
      applyPattern(defaultPattern);
      return;
    }

    function shuffled(basePattern) {
      const arr = basePattern.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    }

    let pattern;

    if (resultEven) {
      // EVEN: 3 patterns: 4 white, 4 red, 2 white + 2 red
      const basePatterns = [
        ["white", "white", "white", "white"],
        ["red", "red", "red", "red"],
        ["white", "white", "red", "red"]
      ];
      const picked =
        basePatterns[Math.floor(Math.random() * basePatterns.length)];
      pattern = shuffled(picked);
    } else {
      // ODD: 2 patterns: 1 red + 3 white, or 3 red + 1 white
      const basePatterns = [
        ["red", "white", "white", "white"],
        ["red", "red", "red", "white"]
      ];
      const picked =
        basePatterns[Math.floor(Math.random() * basePatterns.length)];
      pattern = shuffled(picked);
    }

    applyPattern(pattern);
  }

  function updateDiceLastResultUI() {
    const resEl = $("diceLastResult");
    const outcomeEl = $("diceLastOutcome");
    const winLossEl = $("diceLastWinLoss");
    const payoutEl = $("diceLastPayout");
    const txEl = $("diceLastTx");

    if (!lastDiceGame) {
      if (resEl) resEl.textContent = "-";
      if (outcomeEl) outcomeEl.textContent = "-";
      if (winLossEl) winLossEl.textContent = "-";
      if (payoutEl) payoutEl.textContent = "-";
      if (txEl) txEl.textContent = "-";
      setDiceVisual(null);
      return;
    }

    const { amountVin, choiceEven, resultEven, won, payoutVin, txHash } =
      lastDiceGame;

    const betStr = choiceEven ? "Even" : "Odd";
    const outcomeStr = resultEven ? "Even" : "Odd";

    if (resEl)
      resEl.textContent = `Last roll - Bet: ${betStr}, Amount: ${amountVin}`;
    if (outcomeEl) outcomeEl.textContent = `Outcome: ${outcomeStr}`;
    if (winLossEl) winLossEl.textContent = won ? "WIN" : "LOSE";
    if (payoutEl) payoutEl.textContent = won ? payoutVin : "0";
    if (txEl) txEl.textContent = txHash ? txHash : "-";

    setDiceVisual(resultEven);
  }

  async function loadLastDiceGameFromContract() {
    try {
      if (!currentAccount) return;
      initReadProvider();

      const result = await diceRead.getLastResultByPlayer(currentAccount);
      if (!result) return;

      const amount = result.amount;
      const choiceEven = result.choiceEven;
      const resultEven = result.resultEven;
      const won = result.won;
      const payout = result.payout;

      const amountStr = `${formatVinDisplay(amount, 6)} VIN`;
      const payoutStr = `${formatVinDisplay(payout, 6)} VIN`;

      lastDiceGame = {
        amountVin: amountStr,
        choiceEven,
        resultEven,
        won,
        payoutVin: payoutStr,
        txHash: null
      };

      updateDiceLastResultUI();
    } catch (err) {
      console.error("loadLastDiceGameFromContract error:", err);
    }
  }

  async function refreshDiceLastFromEvents(receipt) {
    try {
      initReadProvider();
      const iface = new ethers.utils.Interface(DICE_ABI);

      const logs = receipt.logs || [];
      for (const log of logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === "Played") {
            const {
              player,
              amount,
              choice,
              result,
              won,
              payout
            } = parsed.args;
            if (
              player &&
              currentAccount &&
              player.toLowerCase() === currentAccount.toLowerCase()
            ) {
              const amountStr = `${formatVinDisplay(amount, 6)} VIN`;
              const payoutStr = `${formatVinDisplay(payout, 6)} VIN`;

              lastDiceGame = {
                amountVin: amountStr,
                choiceEven: choice === 0,
                resultEven: result === 0,
                won,
                payoutVin: payoutStr,
                txHash: receipt.transactionHash
              };

              updateDiceLastResultUI();
              break;
            }
          }
        } catch (e) {
          // ignore non-matching logs
        }
      }
    } catch (err) {
      console.error("refreshDiceLastFromEvents error:", err);
    }
  }

  async function handleDiceApprove() {
    try {
      if (!currentAccount || !web3Provider || !signer) {
        alert("Please connect your wallet first.");
        return;
      }
      if (!(await ensureMonadNetwork())) return;

      initWriteContracts();

      const statusEl = $("diceStatus");
      if (statusEl) statusEl.textContent = "Sending approve transaction...";

      const maxAmount = ethers.utils.parseUnits("100000000", VIN_DECIMALS); // 100,000,000 VIN
      const tx = await vinWrite.approve(DICE_CONTRACT_ADDRESS, maxAmount);
      const receipt = await tx.wait();
      if (receipt.status !== 1) {
        if (statusEl) statusEl.textContent = "Approve transaction reverted.";
        return;
      }

      if (statusEl) statusEl.textContent = "Approve successful.";
      await updateDiceLimitsAndAllowance();
    } catch (err) {
      console.error("handleDiceApprove error:", err);
      const statusEl = $("diceStatus");
      if (statusEl) statusEl.textContent = "Approve failed.";
      alert("Approve transaction failed. Please check console for details.");
    }
  }

  async function handleDicePlay() {
    const statusEl = $("diceStatus");
    if (!statusEl) return;

    try {
      const visual = $("diceVisual");
      if (visual) {
        visual.classList.add("dice-shaking");
      }

      if (!currentAccount || !web3Provider || !signer) {
        alert("Please connect your wallet first.");
        return;
      }
      if (!(await ensureMonadNetwork())) return;

      initReadProvider();
      initWriteContracts();

      const amountBN = getDiceBetAmountBN();
      if (!amountBN || amountBN.lte(0)) {
        statusEl.textContent = "Invalid bet amount.";
        return;
      }

      if (diceMinBetBN && amountBN.lt(diceMinBetBN)) {
        const minStr = formatVinDisplay(diceMinBetBN);
        statusEl.textContent = `Bet is below minimum: ${minStr} VIN.`;
        alert(`Bet is below minimum: ${minStr} VIN.`);
        return;
      }

      if (diceMaxBetBN && amountBN.gt(diceMaxBetBN)) {
        const maxStr = formatVinDisplay(diceMaxBetBN);
        statusEl.textContent =
          `Warning: this bet is higher than the recommended safe maximum (${maxStr} VIN). There is no fixed maximum limit, but please bet responsibly.`;
      }

      const vinBal = await vinRead.balanceOf(currentAccount);
      if (vinBal.lt(amountBN)) {
        statusEl.textContent = "Insufficient VIN balance.";
        alert("Insufficient VIN balance.");
        return;
      }

      const allowance = await vinRead.allowance(
        currentAccount,
        DICE_CONTRACT_ADDRESS
      );
      diceAllowanceBN = allowance;
      if (allowance.lt(amountBN)) {
        const neededStr = formatVinDisplay(amountBN, 6);
        const allowStr = formatVinDisplay(allowance, 6);
        statusEl.textContent =
          "Not enough allowance. Please approve VIN for Dice.";
        alert(
          `Your current allowance is ${allowStr} VIN, but you need at least ${neededStr} VIN.\nPlease click "Approve VIN for Dice" first.`
        );
        return;
      }

      lastDiceBetBN = amountBN;
      const choice = getCurrentDiceChoice();
      const clientSeed = getRandomClientSeed();

      let gasLimit;
      try {
        const gasEstimate = await diceWrite.estimateGas.play(
          amountBN,
          choice,
          clientSeed
        );
        gasLimit = gasEstimate.mul(120).div(100);
      } catch (err) {
        console.error("Dice estimateGas reverted:", err);
        const reason = extractRevertReason(err);
        statusEl.textContent =
          "This bet would revert on-chain. " + (reason || "");
        alert(
          "Dice transaction would revert on-chain.\n" +
            (reason ? `Reason: ${reason}` : "")
        );
        return;
      }

      statusEl.textContent = "Sending Dice transaction...";
      const tx = await diceWrite.play(amountBN, choice, clientSeed, {
        gasLimit
      });
      const receipt = await tx.wait();

      if (receipt.status !== 1) {
        statusEl.textContent = "Dice transaction reverted.";
        return;
      }

      statusEl.textContent = "Dice transaction confirmed. Updating result...";

      await refreshDiceLastFromEvents(receipt);

      if (lastDiceGame) {
        const { won, payoutVin } = lastDiceGame;
        const payoutStr = payoutVin;
        statusEl.textContent = won
          ? `You WON! Payout: ${payoutStr}`
          : "You lost this round.";
      } else {
        statusEl.textContent =
          "Dice transaction confirmed, but event not found.";
      }

      await Promise.all([refreshBalances(), updateDicePool()]);
    } catch (err) {
      console.error("handleDicePlay error:", err);
      const statusEl = $("diceStatus");
      const reason = extractRevertReason(err);
      if (statusEl)
        statusEl.textContent =
          "Dice transaction failed on-chain. " +
          (reason ? `Reason: ${reason}` : "");
      alert(
        "Dice transaction failed on-chain.\n" +
          (reason ? `Reason: ${reason}` : "")
      );
    } finally {
      const visual = $("diceVisual");
      if (visual) {
        visual.classList.remove("dice-shaking");
      }
    }
  }

  function initDiceEvents() {
    const evenBtn = $("diceGuessEven");
    const oddBtn = $("diceGuessOdd");
    const approveBtn = $("diceApproveButton");
    const playBtn = $("dicePlayButton");
    const maxBtn = $("diceMaxButton");
    const refreshLastBtn = $("diceRefreshLast");

    if (evenBtn)
      evenBtn.addEventListener("click", () => onGuessButtonClick(true));
    if (oddBtn)
      oddBtn.addEventListener("click", () => onGuessButtonClick(false));

    if (approveBtn)
      approveBtn.addEventListener("click", () => {
        handleDiceApprove();
      });

    if (playBtn)
      playBtn.addEventListener("click", () => {
        handleDicePlay();
      });

    if (maxBtn) {
      maxBtn.addEventListener("click", async () => {
        if (!currentAccount) return;
        try {
          initReadProvider();
          const vinBal = await vinRead.balanceOf(currentAccount);
          setDiceBetAmountFromBN(vinBal);
        } catch (err) {
          console.error("diceMaxButton click error:", err);
        }
      });
    }

    if (refreshLastBtn) {
      refreshLastBtn.addEventListener("click", async () => {
        await loadLastDiceGameFromContract();
      });
    }

    // Default: EVEN is selected
    onGuessButtonClick(true);
  }

  // ===== Wallet Connection =====
  async function connectWallet() {
    try {
      if (!window.ethereum) {
        alert("No injected wallet found. Please install MetaMask or a compatible wallet.");
        return;
      }

      web3Provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      if (!accounts || !accounts.length) {
        alert("No account selected in wallet.");
        return;
      }

      currentAccount = accounts[0];
      signer = web3Provider.getSigner();
      initWriteContracts();

      setText("homeWalletAddress", shortenAddress(currentAccount));
      setText("diceWalletAddressShort", shortenAddress(currentAccount));
      setNetworkStatus(true);

      const btn = $("connectWalletButton");
      const label = $("connectWalletLabel");
      if (btn && label) {
        label.textContent = shortenAddress(currentAccount);
        btn.classList.add("connected");
      }

      await Promise.all([
        refreshBalances(),
        refreshSwapBalancesLabels(),
        updateDiceLimitsAndAllowance(),
        loadLastDiceGameFromContract()
      ]);
    } catch (err) {
      console.error("connectWallet error:", err);
      alert("Failed to connect wallet. See console for details.");
    }
  }

  function initWalletEvents() {
    const connectBtn = $("connectWalletButton");
    if (connectBtn) {
      connectBtn.addEventListener("click", () => {
        connectWallet();
      });
    }

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", async accounts => {
        if (!accounts || !accounts.length) {
          currentAccount = null;
          signer = null;
          setText("homeWalletAddress", "Not connected");
          setText("diceWalletAddressShort", "Not connected");
          const label = $("connectWalletLabel");
          if (label) label.textContent = "Connect Wallet";
          const btn = $("connectWalletButton");
          if (btn) btn.classList.remove("connected");
          return;
        }

        currentAccount = accounts[0];
        web3Provider = new ethers.providers.Web3Provider(window.ethereum, "any");
        signer = web3Provider.getSigner();
        initWriteContracts();

        setText("homeWalletAddress", shortenAddress(currentAccount));
        setText("diceWalletAddressShort", shortenAddress(currentAccount));
        const label = $("connectWalletLabel");
        if (label) label.textContent = shortenAddress(currentAccount);
        const btn = $("connectWalletButton");
        if (btn) btn.classList.add("connected");

        await Promise.all([
          refreshBalances(),
          refreshSwapBalancesLabels(),
          updateDiceLimitsAndAllowance(),
          loadLastDiceGameFromContract()
        ]);
      });

      window.ethereum.on("chainChanged", async chainId => {
        setNetworkStatus(chainId === MONAD_CHAIN_ID_HEX);
        await refreshBalances();
        await refreshSwapBalancesLabels();
      });
    }
  }

  // ===== Init =====
  async function initApp() {
    try {
      initReadProvider();
      setNetworkStatus(false);

      initNav();
      initSwapEvents();
      initDiceEvents();
      initWalletEvents();

      await updateDicePool();
      updateDiceLastResultUI();
    } catch (err) {
      console.error("initApp error:", err);
    }
  }

  document.addEventListener("DOMContentLoaded", initApp);
})();
