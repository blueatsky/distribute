import { chainMap } from "./chain";
import { coins } from '@cosmjs/launchpad'

import {
    SigningStargateClient,
} from '@cosmjs/stargate'
let chain, offlineSigner, client, accounts;
let disclaimerShown;
import { Bech32 } from "@cosmjs/encoding";
import { sign, broadcastTx } from "./libs/utils";
import { format, floor } from 'mathjs'
import { coin as _coin } from '@cosmjs/stargate'
import axios from 'axios';

function isNumeric (str) {
    if (typeof str != "string") return false
    return !isNaN(str) &&
        !isNaN(parseFloat(str))
}
function coin (amount, denom) {
    return _coin(format(floor(amount), { notation: 'fixed' }), denom)
}

function extractAccountNumberAndSequence (ret) {
    let { account } = ret
    if (account && account.base_vesting_account) { // vesting account
        account = account.base_vesting_account.base_account
    } else if (account && account.base_account) { // evmos based account
        account = account.base_account
    }
    const accountNumber = account.account_number
    const sequence = account.sequence || 0

    return {
        accountNumber,
        sequence,
    }
}

async function reloadPage () {
    $('#status').html('');
    let chainId = $('#chainId').val();
    chain = chainMap[chainId];
    if (!window.getOfflineSigner || !window.keplr) {
        return $.toast({
            heading: "Error",
            text: "Please install keplr extension！",
            position: "top-center",
            showHideTransition: "fade",
            icon: "error",
        });
    } else {
        if (chain.chain_status && window.keplr.experimentalSuggestChain) {
            try {
                await window.keplr.experimentalSuggestChain({
                    chainId: chainId,
                    chainName: chain.name,
                    rpc: chain.rpc,
                    rest: chain.rest,
                    stakeCurrency: {
                        coinDenom: chain.symbol,
                        coinMinimalDenom: chain.denom,
                        coinDecimals: chain.exponent,
                    },
                    gasPriceStep: {
                        low: 0.00,
                        average: 0.01,
                        high: 0.02,
                      },
                    bip44: {

                        coinType: chain.coin_type,
                    },
                    bech32Config: {
                        bech32PrefixAccAddr: chain.prefix,
                        bech32PrefixAccPub: chain.prefix + "pub",
                        bech32PrefixValAddr: chain.prefix + "valoper",
                        bech32PrefixValPub: chain.prefix + "valoperpub",
                        bech32PrefixConsAddr: chain.prefix + "valcons",
                        bech32PrefixConsPub: chain.prefix + "valconspub"
                    },
                    currencies: [{
                        coinDenom: chain.symbol,
                        coinMinimalDenom: chain.denom,
                        coinDecimals: chain.exponent,
                    }],
                    feeCurrencies: [{
                        coinDenom: chain.symbol,
                        coinMinimalDenom: chain.denom,
                        coinDecimals: chain.exponent,

                    }],

                    coinType: chain.coin_type,
                    // gasPriceStep: {
                    //     low: 0.00,
                    //     average: 0.00,
                    //     high: 0.00
                    // }
                });
            } catch (err) {
                console.log(err)
                alert("Failed to suggest the chain");
            }
        }
    }

    await window.keplr.enable(chainId);
    offlineSigner = window.getOfflineSigner(chainId);
    accounts = await offlineSigner.getAccounts();
    client = await SigningStargateClient.connectWithSigner(
        chain.rpc,
        offlineSigner
    );
    let balance = await client.getBalance(accounts[0].address, chain.denom);
    $('#balance').html(`<section>You have <b>${(balance.amount / Math.pow(10, chain.exponent)).toFixed(3)} ${chain.symbol}</b></section>`);
    $('#connected').html(`<section><h2>Connect to wallet</h2>
        <p>Logged in as <b>${accounts[0].address}</b></p>
        </section>`);
    $('#confirmation').html('');
    $('#send').html('');
    document.getElementById("recipients").value = "";


}

window.addEventListener("keplr_keystorechange", () => {
    reloadPage();
})

window.onunhandledrejection = function (e) {
    $.toast().reset("all");
    console.log(e.reason)
    $('#status').html(`<p style="color:red">${e.reason}</p>`);

}

window.onload = () => {
    reloadPage();
};

$('#chainId').change(async () => {
    reloadPage();
});

$('#recipients').on('input', async function () {
    let input = $('#recipients').val();
    let recipients = input.split('\n');
    $('#confirmation').html('');
    let html = "";
    let total = 0;
    if (recipients[0].split(",").length == 2 && recipients[0].split(",")[1] != '') {
        html += `<section><h2>List of Recipients</h2>
        <table class="table">
        <tbody>
        <thead>
    <tr>
      <th colspan="2">Address</th>
      <th style="text-align:right">Amount</th>
    </tr>
  </thead>`;
        for (let recipient of recipients) {
            let data = recipient.split(",");
            if (data.length == 2 && data[1] != '') {
                try {
                    Bech32.decode(data[0], 0);
                } catch (err) {
                    return $.toast({
                        heading: "Error",
                        text: `${data[0]} is not a valid address!`,
                        position: "top-center",
                        showHideTransition: "fade",
                        icon: "error",
                    });
                }
                if (!isNumeric(data[1])) {
                    return $.toast({
                        heading: "Error",
                        text: `${data[1]} is not a valid number!`,
                        position: "top-center",
                        showHideTransition: "fade",
                        icon: "error",
                    });
                }
                html += `<tr>
           <td colspan="2">${data[0]}</td>
           <td align ="right">${data[1]} ${chain.symbol}</td>
           </tr>`;
                total += Number(data[1]);
            }
        };
        let balance = await client.getBalance(accounts[0].address, chain.denom);
        let remaining = (balance.amount / Math.pow(10, chain.exponent) - total).toFixed(3);
        let remainingHtml = '';
        let send = '';
        if (remaining < 0) {
            send = `<button type="submit" class="btn btn-primary" disabled>Transfer</button>
            <div style="color:red">total exceeds balance</div>`;
            remainingHtml = `<div style="color:red">${remaining} ${chain.symbol}</div>`;
        } else {
            send = `<button type="submit" class="btn btn-primary">Transfer</button>`;
            remainingHtml = `<div>${remaining} ${chain.symbol}</div>`;

        }
        let summary = `</tbody></table>
        </section>
        <section><h2>Summary</h2>
        <table class="table">
        <tr>
            <td colspan="2"><b>Total</b></td>
            <td align ="right">${total.toFixed(3)} ${chain.symbol}</td>
        </tr>
        <tr>
            <td colspan="2"><b>Your Balance</b></td>
            <td align ="right"> ${(balance.amount / Math.pow(10, chain.exponent)).toFixed(3)} ${chain.symbol}</td>
        </tr>
        <tr>
            <td colspan="2"><b>Remaining</b></td>
            <td align ="right">${remainingHtml}</td>
        </tr>
        </section>`;

        $('#confirmation').html(html + summary);
        $(`#send`).html(send);
    }
});

$(window).on('load', function () {
    disclaimerShown = window.localStorage.getItem('disclaimerShown');
    if (!disclaimerShown) {
        $('#disclaimer').modal('show');
        window.localStorage.setItem('disclaimerShown', true);
    }
});
$('#sendForm').submit(async function (e) {
    e.preventDefault();
    $.toast().reset("all");
    let input = $('#recipients').val();
    let recipients = input.split('\n');
    let transfers = [];
    for (let recipient of recipients) {
        let data = recipient.split(",");
        if (data.length != 2) {
            return $.toast({
                heading: "Error",
                text: "Please check the input format！",
                position: "top-center",
                showHideTransition: "fade",
                icon: "error",
            });
        } else {
            transfers.push({ address: data[0], amount: data[1] });
        }
    }
    (async () => {
        let chainId = $('#chainId').val();
        chain = chainMap[chainId];
        let gas = chain.gas * transfers.length;
        const fee = {
            amount: [{
                denom: chain.denom,
                amount: "" + chain.min_tx_fee,
            },],
            gas: "" + gas,
        }
        let ops = [];
        for (let transfer of transfers) {
            let amount = transfer.amount * Math.pow(10, chain.exponent);
            ops.push({
                typeUrl: "/cosmos.bank.v1beta1.MsgSend",
                value: {
                    fromAddress: accounts[0].address,
                    toAddress: transfer.address,
                    amount: coins("" + amount, chain.denom)
                },
            })
        }

        $.toast({
            heading: "Transfering",
            text: "Start to transfer",
            position: "top-center",
            showHideTransition: "fade",
            hideAfter: 1000000,
            icon: "info",
        });
        $('#status').html('<p>Processing Transfers...</p>');
        axios
            .get(
                `${chain.rest}/cosmos/auth/v1beta1/accounts/${accounts[0].address}`
            )
            .then((res) => {
                let account = {};
                if (res.status === 200) {
                    let { accountNumber, sequence } = extractAccountNumberAndSequence(res.data);
                    account.accountNumber = accountNumber;
                    account.sequence = sequence;
                }
                const signerData = {
                    accountNumber: account.accountNumber,
                    sequence: account.sequence,
                    chainId: chainId,
                };
                sign(chainId, accounts[0].address, ops, fee, '', signerData).then(
                    (bodyBytes) => {
                        broadcastTx(bodyBytes, chain).then((res) => {
                            $.toast().reset("all");
                            $.toast({
                                heading: "Success",
                                text: "Transaction Successful! ",
                                showHideTransition: "slide",
                                position: "top-center",
                                icon: "success",
                            });
                            if (res.data.tx_response.code === 0) {
                                let status = `<p>Transaction ID: </p><a href='https://ping.pub/${chain.name}/tx/${res.data.tx_response.txhash}' target="_blank">${res.data.tx_response.txhash}</a>`;
                                $('#status').html(status);
                            } else {
                                let status = `<p style="color:red">Failed to send tx: ${res.data.tx_response.log || res.data.tx_response.raw_log}</p>`;
                                $('#status').html(status);
                            }
                        });
                    }
                );
            });
    })();

});
