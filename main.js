/a/ main.js

// ตรวจสอบว่า web3.js ถูกโหลดแล้ว
if (typeof Web3 === 'undefined') {
  alert('Web3.js library not found. Please ensure it is loaded before this script.');
  console.error("CRITICAL ERROR: Web3.js is not loaded. Check script tag order and path.");
} else {
  console.log("Web3.js is detected.");
}

// Global Variables
let web3;
let account;
let stakingContract;
let routerContract;
let usdtContract; 
let kjcContract;  
let kjcDecimals;  
let usdtDecimals; 

// ABIs & Addresses - Expected to be defined in config.js
// (e.g., stakingABI, usdtABI, contractAddress, kjcAddress, usdtAddress, routerAddress, BSC_CHAIN_ID)

// ABI for PancakeSwap Router V2 (minimal)
const ROUTER_ABI_MINIMAL = [
  {
    "inputs":[
      {"internalType":"uint256","name":"amountIn","type":"uint256"},
      {"internalType":"address[]","name":"path","type":"address[]"}
    ],
    "name":"getAmountsOut",
    "outputs":[{"internalType":"uint256[]","name":"","type":"uint256[]"}],
    "stateMutability":"view",
    "type":"function"
  }
];

// Minimal ABI for ERC20 tokens
const ERC20_ABI_MINIMAL = [
  {"constant": true, "inputs": [], "name": "decimals", "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}], "payable": false, "stateMutability": "view", "type": "function"},
  {"constant": false, "inputs": [{"internalType": "address", "name": "spender", "type":"address"},{"internalType":"uint256", "name": "amount", "type":"uint256"}], "name": "approve", "outputs": [{"internalType": "bool", "name": "", "type":"bool"}], "payable": false, "stateMutability": "nonpayable", "type":"function"},
  {"constant": true, "inputs": [{"internalType": "address", "name": "owner", "type":"address"},{"internalType": "address", "name": "spender", "type":"address"}], "name": "allowance", "outputs": [{"internalType":"uint256", "name": "", "type":"uint256"}], "payable": false, "stateMutability":"view", "type":"function"}
];

// Chain ID for Binance Smart Chain Mainnet
// Note: This variable is now sourced from config.js, or uses '0x38' as fallback.
// The direct const declaration here was removed to avoid 'already been declared' error.
// The value will be taken from window.BSC_CHAIN_ID if config.js provides it.


// --- Helper Functions ---

async function getTokenDecimals(tokenContractInstance, fallbackDecimals = 18) {
    if (!tokenContractInstance) {
        console.warn("getTokenDecimals: Token contract instance not provided. Defaulting to", fallbackDecimals, "decimals.");
        return fallbackDecimals;
    }
    try {
        const decimals = await tokenContractInstance.methods.decimals().call();
        return parseInt(decimals);
    } catch (error) {
        console.error("getTokenDecimals: Failed to get token decimals from contract. Falling back to", fallbackDecimals, "decimals:", error);
        return fallbackDecimals;
    }
}

function displayWeiToToken(weiAmount, decimals) {
    if (!web3 || !weiAmount || typeof decimals === 'undefined' || isNaN(decimals)) return '0';
    try {
        const divisor = BigInt(10) ** BigInt(decimals);
        if (BigInt(weiAmount) === BigInt(0)) return '0'; 
        
        let amountStr = BigInt(weiAmount).toString();
        
        if (amountStr.length <= decimals) {
            amountStr = '0.' + '0'.repeat(decimals - amountStr.length) + amountStr;
        } else {
            amountStr = amountStr.slice(0, amountStr.length - decimals) + '.' + amountStr.slice(amountStr.length - decimals);
        }
        return amountStr.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');

    } catch (e) {
        console.error("displayWeiToToken: Error converting Wei to Token display:", e);
        return (parseFloat(weiAmount.toString()) / (10 ** decimals)).toString(); 
    }
}

function tokenToWei(tokenAmount, decimals) {
    if (!web3 || !tokenAmount || typeof decimals === 'undefined' || isNaN(decimals)) return '0';
    try {
        const [integer, fractional] = tokenAmount.toString().split('.');
        let weiAmount = BigInt(integer || '0') * (BigInt(10) ** BigInt(decimals));
        
        if (fractional) {
            if (fractional.length > decimals) {
                console.warn(`tokenToWei: Input fractional part '${fractional}' has more decimals than token (${decimals}). Truncating.`);
            }
            const paddedFractional = (fractional + '0'.repeat(decimals)).slice(0, decimals);
            weiAmount += BigInt(paddedFractional);
        }
        return weiAmount.toString();
    } catch (e) {
        console.error("tokenToWei: Error converting Token to Wei:", e);
        return web3.utils.toWei(tokenAmount.toString(), 'ether'); 
    }
}


// --- Main DApp Functions ---

async function connectWallet() {
  console.log("connectWallet: Function started.");
  document.getElementById("walletAddress").innerText = `กำลังเชื่อมต่อ...`;
  document.getElementById("walletAddress").classList.remove("success", "error");

  if (typeof window.ethereum === 'undefined') {
    alert("กรุณาติดตั้ง MetaMask หรือ Bitget Wallet หรือเปิด DApp ผ่าน Browser ใน Wallet App");
    document.getElementById("walletAddress").innerText = `❌ ไม่พบ Wallet Extension`;
    document.getElementById("walletAddress").classList.add("error");
    console.error("connectWallet: window.ethereum is undefined. Wallet extension not detected.");
    return;
  }
  
  try {
    web3 = new Web3(window.ethereum);
    console.log("connectWallet: Web3 instance created.");

    console.log("connectWallet: Requesting accounts...");
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    account = accounts[0];
    console.log("connectWallet: Connected account:", account);

    console.log("connectWallet: Getting current chain ID...");
    const currentChainId = await web3.eth.getChainId();
    const currentChainIdHex = web3.utils.toHex(currentChainId);
    
    // ใช้ BSC_CHAIN_ID จาก config.js หรือ fallback ถ้าไม่ได้กำหนด
    const currentBSC_CHAIN_ID = typeof window.BSC_CHAIN_ID !== 'undefined' ? window.BSC_CHAIN_ID : '0x38';
    console.log(`connectWallet: Current Chain ID (Hex): ${currentChainIdHex}, Expected: ${currentBSC_CHAIN_ID}`);


    if (currentChainIdHex !== currentBSC_CHAIN_ID) {
      console.warn(`connectWallet: Wrong network. Current: ${currentChainIdHex}, Expected: ${currentBSC_CHAIN_ID}. Attempting to switch.`);
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: currentBSC_CHAIN_ID }],
        });
        console.log("connectWallet: Network switch requested.");
        const newAccounts = await web3.eth.getAccounts();
        account = newAccounts[0];
        console.log("connectWallet: Switched to BSC. Connected account:", account);

      } catch (switchError) {
        if (switchError.code === 4902) {
          console.log("connectWallet: BSC network not found in wallet. Attempting to add it.");
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: currentBSC_CHAIN_ID,
                chainName: 'Binance Smart Chain Mainnet',
                nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                rpcUrls: ['https://bsc-dataseed.binance.org/'],
                blockExplorerUrls: ['https://bscscan.com/'],
              }],
            });
            console.log("connectWallet: BSC network add requested.");
            const newAccounts = await web3.eth.getAccounts();
            account = newAccounts[0];
            console.log("connectWallet: BSC network added. Connected account:", account);

          } catch (addError) {
            console.error("connectWallet: Error adding BSC network:", addError);
            alert("❌ กรุณาเพิ่ม Binance Smart Chain ในกระเป๋าของคุณด้วยตนเอง");
            document.getElementById("walletAddress").innerText = `❌ การเชื่อมต่อล้มเหลว`;
            document.getElementById("walletAddress").classList.add("error");
            return;
          }
        } else {
          console.error("connectWallet: Error switching network:", switchError);
          alert("❌ กรุณาสลับไป Binance Smart Chain ด้วยตนเอง");
            document.getElementById("walletAddress").innerText = `❌ การเชื่อมต่อล้มเหลว`;
            document.getElementById("walletAddress").classList.add("error");
          return;
        }
      }
    }

    document.getElementById("walletAddress").innerText = `✅ ${account}`;
    document.getElementById("walletAddress").classList.add("success");
    document.getElementById("walletAddress").classList.remove("error");
    console.log("connectWallet: Wallet address updated in UI.");

    // --- Initializing Contracts ---
    console.log("connectWallet: Initializing contracts...");
    // ตรวจสอบตัวแปรจาก config.js (ใช้ typeof window.variableName เพื่อให้แน่ใจว่าเป็น global)
    if (typeof window.contractAddress === 'undefined' || typeof window.stakingABI === 'undefined' ||
        typeof window.usdtAddress === 'undefined' || typeof window.usdtABI === 'undefined' ||
        typeof window.kjcAddress === 'undefined' || typeof window.routerAddress === 'undefined' ||
        typeof window.BSC_CHAIN_ID === 'undefined') { 
        
        console.error("connectWallet: Critical: One or more contract addresses/ABIs from config.js are undefined.");
        alert("❌ การตั้งค่า Contract ไม่สมบูรณ์ กรุณาตรวจสอบ config.js และลำดับการโหลด script (ดู Console สำหรับรายละเอียด).");
        document.getElementById("walletAddress").innerText = `❌ การเชื่อมต่อล้มเหลว: config.js error`;
        document.getElementById("walletAddress").classList.add("error");
        document.getElementById("walletAddress").classList.remove("success");
        return;
    }

    // ใช้ตัวแปรจาก config.js โดยตรง (ไม่ต้องใช้ window. นำหน้าแล้ว ถ้า config.js โหลดก่อน main.js ถูกต้อง)
    stakingContract = new web3.eth.Contract(stakingABI, contractAddress);
    routerContract = new web3.eth.Contract(ROUTER_ABI_MINIMAL, routerAddress); 
    usdtContract = new web3.eth.Contract(usdtABI, usdtAddress); 
    kjcContract = new web3.eth.Contract(ERC20_ABI_MINIMAL, kjcAddress); 
    console.log("connectWallet: Contracts initialized successfully.");

    usdtDecimals = await getTokenDecimals(usdtContract, 18); 
    kjcDecimals = await getTokenDecimals(kjcContract, 18);  
    console.log(`connectWallet: USDT Decimals: ${usdtDecimals}, KJC Decimals: ${kjcDecimals}`);


    generateReferralLink();
    loadStakingInfo();
    loadReferralInfo(); 
    console.log("connectWallet: Connection successful and DApp functions called.");
  } catch (error) {
    console.error("❌ connectWallet: Uncaught error during connection process:", error);
    const errorMessage = getFriendlyErrorMessage(error);
    alert("❌ การเชื่อมต่อกระเป๋าของล้มเหลว: " + errorMessage); 
    document.getElementById("walletAddress").innerText = `❌ การเชื่อมต่อล้มเหลว`;
    document.getElementById("walletAddress").classList.add("error");
  }
}

function generateReferralLink() {
  if (!account) {
    document.getElementById("refLink").value = "โปรดเชื่อมต่อกระเป๋าเพื่อสร้างลิงก์";
    return;
  }
  const link = `${window.location.origin}${window.location.pathname}?ref=${account}`;
  document.getElementById("refLink").value = link;
}

function copyRefLink() {
  const input = document.getElementById("refLink");
  input.select();
  input.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(input.value);
  alert("✅ คัดลอกลิงก์เรียบร้อยแล้ว!");
}

function getReferrerFromURL() {
  if (web3 && web3.utils) { 
      const urlParams = new URLSearchParams(window.location.search);
      const ref = urlParams.get('ref');
      if (ref && web3.utils.isAddress(ref)) {
        document.getElementById("refAddress").value = ref;
      }
  } else {
      console.warn("getReferrerFromURL: web3 or web3.utils not available yet.");
  }
}

async function registerReferrer() {
  if (!stakingContract || !account) {
    alert("กรุณาเชื่อมกระเป๋าก่อน");
    return;
  }

  const ref = document.getElementById("refAddress").value;
  if (!web3.utils.isAddress(ref) || ref.toLowerCase() === account.toLowerCase()) {
    alert("❌ Referrer address ไม่ถูกต้อง หรือเป็น Address ของคุณเอง");
    return;
  }
  document.getElementById("registerStatus").innerText = "กำลังดำเนินการสมัคร Referrer...";
  document.getElementById("registerStatus").classList.remove("error", "success");

  try {
    const txResponse = await stakingContract.methods.setReferrer(ref).send({ from: account });
    console.log("registerReferrer: Tx Hash:", txResponse.transactionHash);
    
    document.getElementById("registerStatus").innerText = "กำลังรอการยืนยันการสมัคร Referrer...";

    const receipt = await web3.eth.getTransactionReceipt(txResponse.transactionHash);
    
    if (receipt && receipt.status) {
        document.getElementById("registerStatus"].innerText = "✅ สมัคร Referrer สำเร็จแล้ว!"; 
        document.getElementById("registerStatus"].classList.add("success");
        console.log("registerReferrer: Confirmed:", receipt);
    } else {
        document.getElementById("registerStatus"].innerText = "❌ การสมัคร Referrer ไม่สำเร็จ หรือธุรกรรมถูกปฏิเสธ";
        document.getElementById("registerStatus"].classList.add("error");
        console.error("registerReferrer: Failed or not confirmed:", receipt);
    }
    
  } catch (e) {
    console.error("registerReferrer: Error:", e);
    const errorMessage = getFriendlyErrorMessage(e);
    document.getElementById("registerStatus"].innerText = `❌ เกิดข้อผิดพลาดในการสมัคร Referrer: ${errorMessage}`;
    document.getElementById("registerStatus"].classList.add("error");
    alert(`❌ เกิดข้อผิดพลาดในการสมัคร Referrer: ${errorMessage}`);
  }
}

async function buyToken() {
  if (!stakingContract || !account || !usdtContract || !routerContract || typeof usdtDecimals === 'undefined' || typeof kjcDecimals === 'undefined') {
    alert("⚠️ กำลังโหลดข้อมูล กรุณารอสักครู่แล้วลองใหม่");
    console.warn("buyToken: Contracts or decimals not initialized yet.");
    return;
  }

  const rawInput = document.getElementById("usdtAmount").value.trim();
  if (!rawInput || isNaN(rawInput) || parseFloat(rawInput) <= 0) {
    alert("❌ กรุณาใส่จำนวน USDT ที่จะใช้ซื้อให้ถูกต้อง (ต้องมากกว่า 0)");
    return;
  }

  const usdtAmountFloat = parseFloat(rawInput);
  const usdtInWei = tokenToWei(usdtAmountFloat, usdtDecimals);
  
  console.log(`buyToken: USDT Amount (User Input): ${usdtAmountFloat}`);
  console.log(`buyToken: USDT Amount (in Wei, based on ${usdtDecimals} decimals): ${usdtInWei}`);

  document.getElementById("buyTokenStatus").innerText = "กำลังดำเนินการซื้อ KJC...";
  document.getElementById("buyTokenStatus"].classList.remove("error", "success");

  try {
    if (!web3.utils.isAddress(usdtAddress) || !web3.utils.isAddress(kjcAddress)) {
        alert("❌ ที่อยู่ Token ไม่ถูกต้องใน config.js");
        document.getElementById("buyTokenStatus"].innerText = "❌ ที่อยู่ Token ไม่ถูกต้อง";
        document.getElementById("buyTokenStatus"].classList.add("error");
        return;
    }

    const path = [usdtAddress, kjcAddress];

    console.log("buyToken: Getting amounts out from router...");
    const amountsOut = await routerContract.methods.getAmountsOut(usdtInWei, path).call();
    const expectedKjcOutWei = BigInt(amountsOut[1]);
    console.log(`buyToken: Expected KJC from Router (raw Wei): ${expectedKjcOutWei.toString()}`);
    console.log(`buyToken: Expected KJC from Router (formatted): ${displayWeiToToken(expectedKjcOutWei, kjcDecimals)} KJC`);

    const SLIPPAGE_PERCENTAGE = 5;
    const minOut = expectedKjcOutWei * BigInt(100 - SLIPPAGE_PERCENTAGE) / 100n;
    console.log(`buyToken: Minimum KJC to receive (with ${SLIPPAGE_PERCENTAGE}% slippage): ${minOut.toString()} Wei`);
    console.log(`buyToken: Minimum KJC to receive (formatted): ${displayWeiToToken(minOut, kjcDecimals)} KJC`);

    console.log("buyToken: Checking current allowance...");
    const allowance = await usdtContract.methods.allowance(account, contractAddress).call();
    console.log(`buyToken: Current Allowance for Staking Contract: ${allowance.toString()} Wei`);

    if (BigInt(allowance) < BigInt(usdtInWei)) {
      console.log("buyToken: Allowance insufficient. Initiating approval...");
      document.getElementById("buyTokenStatus").innerText = "กำลังขออนุมัติ USDT...";
      const approveTx = await usdtContract.methods.approve(contractAddress, usdtInWei).send({ from: account });
      console.log("buyToken: Approve Transaction Hash:", approveTx.transactionHash);
      alert("✅ การอนุมัติ USDT สำเร็จแล้ว! กรุณากด 'ซื้อเหรียญ KJC' อีกครั้งเพื่อดำเนินการ Stake.");
      document.getElementById("buyTokenStatus"].innerText = "✅ อนุมัติสำเร็จ! กดอีกครั้งเพื่อซื้อ";
      document.getElementById("buyTokenStatus"].classList.add("success");
      return; 
    } else {
      console.log("buyToken: Allowance is sufficient. Proceeding with buy and stake.");
    }

    console.log("buyToken: Initiating buyAndStake transaction...");
    document.getElementById("buyTokenStatus"].innerText = "กำลังส่งธุรกรรมซื้อและ Stake...";
    const buyTx = await stakingContract.methods.buyAndStake(usdtInWei, minOut.toString()).send({ from: account });
    console.log("buyToken: Buy and Stake Transaction Hash:", buyTx.transactionHash);

    document.getElementById("buyTokenStatus"].innerText = "กำลังรอการยืนยันการซื้อ KJC...";
    const receipt = await web3.eth.getTransactionReceipt(buyTx.transactionHash);

    if (receipt && receipt.status) {
        alert(`✅ ซื้อ ${usdtAmountFloat} USDT และ Stake สำเร็จ!`);
        document.getElementById("buyTokenStatus"].innerText = `✅ ซื้อ ${usdtAmountFloat} USDT และ Stake สำเร็จ!`;
        document.getElementById("buyTokenStatus"].classList.add("success");
        loadStakingInfo();
        loadReferralInfo(); 
    } else {
        alert(`❌ การซื้อ ${usdtAmountFloat} USDT และ Stake ไม่สำเร็จ หรือธุรกรรมถูกปฏิเสธ`);
        document.getElementById("buyTokenStatus"].innerText = `❌ การซื้อ KJC ไม่สำเร็จ!`;
        document.getElementById("buyTokenStatus"].classList.add("error");
    }

  } catch (e) {
    console.error("buyToken: Error:", e);
    const errorMessage = getFriendlyErrorMessage(e);
    alert(`❌ เกิดข้อผิดพลาดในการซื้อเหรียญ: ${errorMessage}`);
    document.getElementById("buyTokenStatus"].innerText = `❌ ข้อผิดพลาด: ${errorMessage}`;
    document.getElementById("buyTokenStatus"].classList.add("error");
  }
}

async function loadStakingInfo() {
  if (!stakingContract || !account || typeof kjcDecimals === 'undefined') {
      document.getElementById("stakeAmount").innerText = "⚠️ กำลังโหลดข้อมูล...";
      console.warn("loadStakingInfo: Contracts or decimals not initialized.");
      return;
  }
  try {
    const rawAmount = await stakingContract.methods.stakedAmount(account).call();
    const stakeTime = await stakingContract.methods.lastStakeTime(account).call();
    const duration = await stakingContract.methods.STAKE_DURATION().call();
    
    const display = displayWeiToToken(rawAmount, kjcDecimals);

    const depositDate = new Date(Number(stakeTime) * 1000);
    const endDate = new Date((Number(stakeTime) + Number(duration)) * 1000);
    const formatDate = (d) => d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    document.getElementById("stakeAmount").innerHTML = `
      💰 จำนวน: ${display} KJC<br/>
      📅 ฝากเมื่อ: ${formatDate(depositDate)}<br/>
      ⏳ ครบกำหนด: ${formatDate(endDate)}
    `;
    console.log("loadStakingInfo: Staking info loaded successfully.");
  } catch (e) {
    console.error("loadStakingInfo: Error loading stake info:", e);
    document.getElementById("stakeAmount"].innerText = "❌ โหลดไม่สำเร็จ: " + (e.message || "Unknown error");
    document.getElementById("stakeAmount"].classList.add("error");
  }
}

async function claimReward() {
  if (!stakingContract || !account) {
    document.getElementById("claimStakeStatus").innerText = "⚠️ กรุณาเชื่อมกระเป๋าก่อน";
    return;
  }

  document.getElementById("claimStakeStatus"].innerText = "กำลังดำเนินการเคลมรางวัล Stake...";
  document.getElementById("claimStakeStatus"].classList.remove("error", "success");

  try {
    const lastClaimTime = await stakingContract.methods.lastClaim(account).call();
    const claimInterval = await stakingContract.methods.CLAIM_INTERVAL().call();
    const now = Math.floor(Date.now() / 1000);

    const nextClaimTime = Number(lastClaimTime) + Number(claimInterval);

    if (now >= nextClaimTime) {
      const tx = await stakingContract.methods.claimStakingReward().send({ from: account });
      console.log("claimReward: Tx Hash:", tx.transactionHash);
      
      document.getElementById("claimStakeStatus").innerText = "กำลังรอการยืนยันการเคลมรางวัล Stake...";
      const receipt = await web3.eth.getTransactionReceipt(tx.transactionHash);

      if (receipt && receipt.status) {
          alert("🎉 เคลมรางวัล Stake สำเร็จแล้ว!");
          document.getElementById("claimStakeStatus"].innerText = "🎉 เคลมรางวัล Stake สำเร็จแล้ว!";
          document.getElementById("claimStakeStatus"].classList.add("success");
          loadStakingInfo();
      } else {
          alert("❌ การเคลมรางวัล Stake ไม่สำเร็จ หรือธุรกรรมถูกปฏิเสธ");
          document.getElementById("claimStakeStatus"].innerText = "❌ การเคลมล้มเหลว!";
          document.getElementById("claimStakeStatus"].classList.add("error");
      }
    } else {
      const remainingSeconds = nextClaimTime - now;
      const waitMinutes = Math.ceil(remainingSeconds / 60);
      const waitHours = Math.floor(waitMinutes / 60);
      const remainingMinutes = waitMinutes % 60;
      let waitString = "";
      if (waitHours > 0) waitString += `${waitHours} ชั่วโมง `;
      if (remainingMinutes > 0 || waitHours === 0) waitString += `${remainingMinutes} นาที`;
      document.getElementById("claimStakeStatus").innerText = `⏳ ต้องรออีก ${waitString}`;
    }
  } catch (e) {
    console.error("claimReward: Error:", e);
    const errorMessage = getFriendlyErrorMessage(e);
    document.getElementById("claimStakeStatus"].innerText = `❌ เกิดข้อผิดพลาดในการเคลมรางวัล: ${errorMessage}`;
    document.getElementById("claimStakeStatus"].classList.add("error");
    alert(`❌ เกิดข้อผิดพลาดในการเคลมรางวัล: ${errorMessage}`);
  }
}

async function loadReferralInfo() {
  if (!stakingContract || !account || typeof kjcDecimals === 'undefined') {
    document.getElementById("referralRewardAmount").innerText = "⚠️ กำลังโหลดข้อมูล...";
    console.warn("loadReferralInfo: Contracts or decimals not initialized.");
    return;
  }
  try {
    const rawReferralAmount = await stakingContract.methods.referralReward(account).call();
    const displayReferral = displayWeiToToken(rawReferralAmount, kjcDecimals);

    document.getElementById("referralRewardAmount").innerHTML = `
      💰 จำนวนค่าแนะนำที่เคลมได้: ${displayReferral} KJC
    `;
    console.log("loadReferralInfo: Referral info loaded successfully.");
  } catch (e) {
    console.error("loadReferralInfo: Error loading referral info:", e);
    document.getElementById("referralRewardAmount").innerText = "❌ โหลดค่าแนะนำไม่สำเร็จ: " + (e.message || "Unknown error");
    document.getElementById("referralRewardAmount"].classList.add("error");
  }
}

async function claimReferralReward() {
  if (!stakingContract || !account) {
    document.getElementById("referralClaimStatus").innerText = "⚠️ กรุณาเชื่อมกระเป๋าก่อน";
    return;
  }

  document.getElementById("referralClaimStatus"].innerText = "กำลังดำเนินการเคลมรางวัลค่าแนะนำ...";
  document.getElementById("referralClaimStatus"].classList.remove("error", "success");

  try {
    const rawClaimable = await stakingContract.methods.referralReward(account).call();
    if (BigInt(rawClaimable) === BigInt(0)) {
        alert("✅ ไม่มีรางวัลค่าแนะนำให้เคลม");
        document.getElementById("referralClaimStatus"].innerText = "ไม่มีรางวัลค่าแนะนำ";
        document.getElementById("referralClaimStatus"].classList.add("success");
        return;
    }

    const tx = await stakingContract.methods.claimReferralReward().send({ from: account });
    console.log("claimReferralReward: Tx Hash:", tx.transactionHash);
    
    document.getElementById("referralClaimStatus"].innerText = "กำลังรอการยืนยันการเคลมค่าแนะนำ...";
    const receipt = await web3.eth.getTransactionReceipt(tx.transactionHash);

    if (receipt && receipt.status) {
        alert("🎉 เคลมรางวัลค่าแนะนำสำเร็จแล้ว!");
        document.getElementById("referralClaimStatus"].innerText = "🎉 เคลมรางวัลค่าแนะนำสำเร็จแล้ว!";
        document.getElementById("referralClaimStatus"].classList.add("success");
        loadReferralInfo();
        loadStakingInfo(); 
    } else {
        alert("❌ การเคลมรางวัลค่าแนะนำไม่สำเร็จ หรือธุรกรรมถูกปฏิเสธ");
        document.getElementById("referralClaimStatus"].innerText = "❌ การเคลมล้มเหลว!";
        document.getElementById("referralClaimStatus"].classList.add("error");
        console.error("claimReferralReward: Failed or not confirmed:", receipt);
    }
  } catch (e) {
    console.error("claimReferralReward: Error:", e);
    const errorMessage = getFriendlyErrorMessage(e);
    document.getElementById("referralClaimStatus"].innerText = `❌ เกิดข้อผิดพลาดในการเคลมรางวัลค่าแนะนำ: ${errorMessage}`;
    document.getElementById("referralClaimStatus"].classList.add("error");
    alert(`❌ เกิดข้อผิดพลาดในการเคลมรางวัลค่าแนะนำ: ${errorMessage}`);
  }
}

function getFriendlyErrorMessage(error) {
    let errorMessage = "Unknown error occurred.";
    if (error.message) {
        errorMessage = error.message;
        if (errorMessage.includes("User denied transaction signature")) {
            errorMessage = "ผู้ใช้ยกเลิกธุรกรรม";
        } else if (errorMessage.includes("execution reverted")) {
            const revertReasonMatch = errorMessage.match(/revert: (.*?)(?=[,}]|$)/);
            if (revertReasonMatch && revertReasonMatch[1]) {
                errorMessage = `ธุรกรรมล้มเหลว: ${revertReasonMatch[1].trim()}`;
            } else {
                errorMessage = "ธุรกรรมล้มเหลวบน Smart Contract (อาจเกิดจาก Slippage หรือเงื่อนไขอื่นๆ)";
            }
        } else if (errorMessage.includes("gas required exceeds allowance")) {
            errorMessage = "Gas ไม่เพียงพอ หรือ Gas Limit ต่ำเกินไป";
        } else if (errorMessage.includes("insufficient funds for gas")) {
            errorMessage = "ยอด BNB ในกระเป๋าไม่พอสำหรับค่า Gas";
        } else if (errorMessage.includes("missing trie node")) {
            errorMessage = "ข้อมูลเครือข่ายไม่สมบูรณ์ กรุณาลองใหม่ หรือเปลี่ยน RPC Node ใน Wallet";
        } else if (errorMessage.includes("Transaction was not mined within 50 blocks")) {
            errorMessage = "ธุรกรรมรอนานเกินไป (อาจต้องเพิ่ม Gas Price หรือเครือข่ายหนาแน่น)";
        } else if (errorMessage.includes("The nonce is too low")) {
            errorMessage = "Nonce ของธุรกรรมต่ำเกินไป กรุณารีเซ็ต Wallet หรือลองใหม่";
        }
    } else if (error.code) {
        if (error.code === 4001) {
            errorMessage = "ผู้ใช้ยกเลิกธุรกรรม";
        } else if (error.code === -32000) {
            errorMessage = "RPC Error: " + (error.message || "โปรดลองใหม่ในภายหลัง");
        }
    }
    return errorMessage;
}

// Event Listeners (ใช้ ID ของปุ่มใน HTML)
window.addEventListener('load', () => {
  console.log("Window loaded. Attaching event listeners.");
  getReferrerFromURL();
  
  document.getElementById("connectWalletBtn")?.addEventListener('click', connectWallet);
  document.getElementById("copyRefLinkBtn")?.addEventListener('click', copyRefLink);
  document.getElementById("registerReferrerBtn")?.addEventListener('click', registerReferrer);
  document.getElementById("buyTokenBtn")?.addEventListener('click', buyToken);
  document.getElementById("claimStakeRewardBtn")?.addEventListener('click', claimReward);
  document.getElementById("claimReferralRewardBtn")?.addEventListener('click', claimReferralReward);
});

// Optional: Handle Wallet events for better UX
window.ethereum?.on('accountsChanged', (accounts) => {
    console.log("Accounts changed event detected:", accounts);
    if (accounts.length > 0) {
        connectWallet(); 
    } else {
        account = null;
        document.getElementById("walletAddress").innerText = `❌ ยังไม่เชื่อมต่อกระเป๋า`;
        document.getElementById("walletAddress").classList.remove("success");
        document.getElementById("stakeAmount").innerText = "โปรดเชื่อมต่อกระเป๋า";
        document.getElementById("refLink").value = "";
        document.getElementById("referralRewardAmount").innerText = "โปรดเชื่อมต่อกระเป๋า";
    }
});

window.ethereum?.on('chainChanged', (chainId) => {
    console.log("Chain changed event detected:", chainId);
    connectWallet();
});
