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

// ABI สำหรับ PancakeSwap Router V2 (แบบย่อ)
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

// ABI ย่อของ ERC20
const ERC20_ABI_MINIMAL = [
  {"constant": true, "inputs": [], "name": "decimals", "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}], "stateMutability": "view", "type": "function"},
  {"constant": false, "inputs": [{"internalType": "address", "name": "spender", "type":"address"}, {"internalType":"uint256", "name": "amount", "type":"uint256"}], "name": "approve", "outputs": [{"internalType": "bool", "name": "", "type":"bool"}], "stateMutability": "nonpayable", "type":"function"},
  {"constant": true, "inputs": [{"internalType": "address", "name": "owner", "type":"address"}, {"internalType": "address", "name": "spender", "type":"address"}], "name": "allowance", "outputs": [{"internalType":"uint256", "name": "", "type":"uint256"}], "stateMutability":"view", "type":"function"}
];

// --- ฟังก์ชันช่วยแปลงจำนวน ---

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
async function connectWallet() {
  console.log("connectWallet: Function started.");
  document.getElementById("walletAddress").innerText = `กำลังเชื่อมต่อ...`;
  document.getElementById("walletAddress").classList.remove("success", "error");

  if (typeof window.ethereum === 'undefined') {
    alert("กรุณาติดตั้ง MetaMask หรือ Bitget Wallet หรือเปิด DApp ผ่าน Browser ใน Wallet App");
    document.getElementById("walletAddress").innerText = `❌ ไม่พบ Wallet Extension`;
    document.getElementById("walletAddress").classList.add("error");
    return;
  }

  try {
    web3 = new Web3(window.ethereum);
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    account = accounts[0];

    const currentChainId = await web3.eth.getChainId();
    const currentChainIdHex = web3.utils.toHex(currentChainId);
    const currentBSC_CHAIN_ID = typeof window.BSC_CHAIN_ID !== 'undefined' ? window.BSC_CHAIN_ID : '0x38';

    if (currentChainIdHex !== currentBSC_CHAIN_ID) {
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: currentBSC_CHAIN_ID }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
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
        } else {
          alert("❌ กรุณาสลับไป Binance Smart Chain ด้วยตนเอง");
          return;
        }
      }
    }

    document.getElementById("walletAddress").innerText = `✅ ${account}`;
    document.getElementById("walletAddress").classList.add("success");

    if (typeof window.contractAddress === 'undefined' || typeof window.stakingABI === 'undefined' ||
        typeof window.usdtAddress === 'undefined' || typeof window.usdtABI === 'undefined' ||
        typeof window.kjcAddress === 'undefined' || typeof window.routerAddress === 'undefined') {
      alert("❌ การตั้งค่า Contract ไม่สมบูรณ์ กรุณาตรวจสอบ config.js");
      return;
    }

    stakingContract = new web3.eth.Contract(stakingABI, contractAddress);
    routerContract = new web3.eth.Contract(ROUTER_ABI_MINIMAL, routerAddress);
    usdtContract = new web3.eth.Contract(usdtABI, usdtAddress);
    kjcContract = new web3.eth.Contract(ERC20_ABI_MINIMAL, kjcAddress);

    usdtDecimals = await getTokenDecimals(usdtContract, 18);
    kjcDecimals = await getTokenDecimals(kjcContract, 18);

    generateReferralLink();
    loadStakingInfo();
    loadReferralInfo();
  } catch (error) {
    alert("❌ การเชื่อมต่อกระเป๋าล้มเหลว: " + error.message);
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
    const receipt = await web3.eth.getTransactionReceipt(txResponse.transactionHash);

    if (receipt && receipt.status) {
      document.getElementById("registerStatus").innerText = "✅ สมัคร Referrer สำเร็จแล้ว!";
      document.getElementById("registerStatus").classList.add("success");
    } else {
      document.getElementById("registerStatus").innerText = "❌ การสมัคร Referrer ไม่สำเร็จ";
      document.getElementById("registerStatus").classList.add("error");
    }
  } catch (e) {
    const errorMessage = e.message || "ไม่สามารถดำเนินการได้";
    document.getElementById("registerStatus").innerText = `❌ เกิดข้อผิดพลาด: ${errorMessage}`;
    document.getElementById("registerStatus").classList.add("error");
  }
}
async function buyToken() {
  if (!stakingContract || !account || !usdtContract || !routerContract || typeof usdtDecimals === 'undefined' || typeof kjcDecimals === 'undefined') {
    alert("⚠️ กำลังโหลดข้อมูล กรุณารอสักครู่แล้วลองใหม่");
    return;
  }

  const rawInput = document.getElementById("usdtAmount").value.trim();
  if (!rawInput || isNaN(rawInput) || parseFloat(rawInput) <= 0) {
    alert("❌ กรุณาใส่จำนวน USDT ที่จะใช้ซื้อให้ถูกต้อง (ต้องมากกว่า 0)");
    return;
  }

  const usdtAmountFloat = parseFloat(rawInput);
  const usdtInWei = tokenToWei(usdtAmountFloat, usdtDecimals);

  document.getElementById("buyTokenStatus").innerText = "กำลังดำเนินการซื้อ KJC...";
  document.getElementById("buyTokenStatus").classList.remove("error", "success");

  try {
    const path = [usdtAddress, kjcAddress];
    const amountsOut = await routerContract.methods.getAmountsOut(usdtInWei, path).call();
    const expectedKjcOutWei = BigInt(amountsOut[1]);
    const SLIPPAGE_PERCENTAGE = 5;
    const minOut = expectedKjcOutWei * BigInt(100 - SLIPPAGE_PERCENTAGE) / 100n;

    const allowance = await usdtContract.methods.allowance(account, contractAddress).call();
    if (BigInt(allowance) < BigInt(usdtInWei)) {
      document.getElementById("buyTokenStatus").innerText = "กำลังขออนุมัติ USDT...";
      const approveTx = await usdtContract.methods.approve(contractAddress, usdtInWei).send({ from: account });
      alert("✅ อนุมัติ USDT สำเร็จแล้ว! กรุณากด 'ซื้อเหรียญ KJC' อีกครั้ง");
      document.getElementById("buyTokenStatus").innerText = "✅ อนุมัติสำเร็จ! กดอีกครั้งเพื่อซื้อ";
      document.getElementById("buyTokenStatus").classList.add("success");
      return;
    }

    const buyTx = await stakingContract.methods.buyAndStake(usdtInWei, minOut.toString()).send({ from: account });
    const receipt = await web3.eth.getTransactionReceipt(buyTx.transactionHash);

    if (receipt && receipt.status) {
      alert(`✅ ซื้อ ${usdtAmountFloat} USDT และ Stake สำเร็จ!`);
      document.getElementById("buyTokenStatus").innerText = `✅ ซื้อสำเร็จแล้ว`;
      document.getElementById("buyTokenStatus").classList.add("success");
      loadStakingInfo();
      loadReferralInfo();
    } else {
      alert("❌ การซื้อไม่สำเร็จ หรือธุรกรรมถูกปฏิเสธ");
      document.getElementById("buyTokenStatus").innerText = `❌ การซื้อ KJC ไม่สำเร็จ!`;
      document.getElementById("buyTokenStatus").classList.add("error");
    }
  } catch (e) {
    const errorMessage = getFriendlyErrorMessage(e);
    document.getElementById("buyTokenStatus").innerText = `❌ ${errorMessage}`;
    document.getElementById("buyTokenStatus").classList.add("error");
    alert(`❌ เกิดข้อผิดพลาด: ${errorMessage}`);
  }
}

async function loadStakingInfo() {
  if (!stakingContract || !account || typeof kjcDecimals === 'undefined') return;
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
  } catch (e) {
    document.getElementById("stakeAmount").innerText = "❌ โหลดไม่สำเร็จ";
  }
}

async function claimReward() {
  if (!stakingContract || !account) return;

  document.getElementById("claimStakeStatus").innerText = "⏳ กำลังเคลมรางวัล...";
  document.getElementById("claimStakeStatus").classList.remove("error", "success");

  try {
    const lastClaimTime = await stakingContract.methods.lastClaim(account).call();
    const claimInterval = await stakingContract.methods.CLAIM_INTERVAL().call();
    const now = Math.floor(Date.now() / 1000);
    const nextClaimTime = Number(lastClaimTime) + Number(claimInterval);

    if (now >= nextClaimTime) {
      const tx = await stakingContract.methods.claimStakingReward().send({ from: account });
      const receipt = await web3.eth.getTransactionReceipt(tx.transactionHash);
      if (receipt && receipt.status) {
        document.getElementById("claimStakeStatus").innerText = "🎉 เคลมสำเร็จแล้ว!";
        document.getElementById("claimStakeStatus").classList.add("success");
        loadStakingInfo();
      }
    } else {
      const remainingSeconds = nextClaimTime - now;
      const waitMinutes = Math.ceil(remainingSeconds / 60);
      document.getElementById("claimStakeStatus").innerText = `⏳ โปรดรออีก ${waitMinutes} นาที`;
    }
  } catch (e) {
    const msg = getFriendlyErrorMessage(e);
    document.getElementById("claimStakeStatus").innerText = `❌ ${msg}`;
    document.getElementById("claimStakeStatus").classList.add("error");
  }
}

async function loadReferralInfo() {
  if (!stakingContract || !account || typeof kjcDecimals === 'undefined') return;
  try {
    const raw = await stakingContract.methods.referralReward(account).call();
    const formatted = displayWeiToToken(raw, kjcDecimals);
    document.getElementById("referralRewardAmount").innerHTML = `💰 จำนวนค่าแนะนำที่เคลมได้: ${formatted} KJC`;
  } catch (e) {
    document.getElementById("referralRewardAmount").innerText = "❌ โหลดไม่สำเร็จ";
  }
}

async function claimReferralReward() {
  if (!stakingContract || !account) return;

  document.getElementById("referralClaimStatus").innerText = "⏳ กำลังเคลมค่าแนะนำ...";
  document.getElementById("referralClaimStatus").classList.remove("error", "success");

  try {
    const raw = await stakingContract.methods.referralReward(account).call();
    if (BigInt(raw) === 0n) {
      document.getElementById("referralClaimStatus").innerText = "ไม่มีรางวัลค่าแนะนำ";
      document.getElementById("referralClaimStatus").classList.add("success");
      return;
    }

    const tx = await stakingContract.methods.claimReferralReward().send({ from: account });
    const receipt = await web3.eth.getTransactionReceipt(tx.transactionHash);
    if (receipt && receipt.status) {
      document.getElementById("referralClaimStatus").innerText = "🎉 เคลมค่าแนะนำสำเร็จ!";
      document.getElementById("referralClaimStatus").classList.add("success");
      loadReferralInfo();
      loadStakingInfo();
    }
  } catch (e) {
    const msg = getFriendlyErrorMessage(e);
    document.getElementById("referralClaimStatus").innerText = `❌ ${msg}`;
    document.getElementById("referralClaimStatus").classList.add("error");
  }
}

function getFriendlyErrorMessage(error) {
  if (!error || !error.message) return "เกิดข้อผิดพลาดไม่ทราบสาเหตุ";
  if (error.message.includes("User denied")) return "ผู้ใช้ยกเลิกธุรกรรม";
  if (error.message.includes("execution reverted")) return "ธุรกรรมถูกปฏิเสธโดย Smart Contract";
  if (error.message.includes("insufficient funds")) return "ยอด BNB ไม่พอจ่ายค่า Gas";
  return error.message;
}

// Event Listeners
window.addEventListener('load', () => {
  getReferrerFromURL();
  document.getElementById("connectWalletBtn")?.addEventListener('click', connectWallet);
  document.getElementById("copyRefLinkBtn")?.addEventListener('click', copyRefLink);
  document.getElementById("registerReferrerBtn")?.addEventListener('click', registerReferrer);
  document.getElementById("buyTokenBtn")?.addEventListener('click', buyToken);
  document.getElementById("claimStakeRewardBtn")?.addEventListener('click', claimReward);
  document.getElementById("claimReferralRewardBtn")?.addEventListener('click', claimReferralReward);
});

window.ethereum?.on('accountsChanged', () => connectWallet());
window.ethereum?.on('chainChanged', () => connectWallet());
