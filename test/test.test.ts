/* eslint-disable node/no-missing-import */
/* eslint-disable prettier/prettier */
/* eslint-disable no-unused-vars */
import { expect } from "chai";
import { ethers } from "hardhat";
import * as Util from "./utils";
import { 
  deploy, 
  waitForSubgraphToBeSynced, 
  fetchSubgraph, 
  exec, 
  balancerDeploy, 
  factoriesDeploy  
} from "./utils";
import { ApolloFetch, FetchResult } from "apollo-fetch";
import * as path from "path";
import RESERVE_TOKEN from "@beehiveinnovation/rain-protocol/artifacts/contracts/test/ReserveToken.sol/ReserveToken.json";
import READWRITE_TIER from "@beehiveinnovation/rain-protocol/artifacts/contracts/tier/ReadWriteTier.sol/ReadWriteTier.json";
import seedERC20Json from "@beehiveinnovation/rain-protocol/artifacts/contracts/seed/SeedERC20.sol/SeedERC20.json";
import redeemableTokenJson from "@beehiveinnovation/rain-protocol/artifacts/contracts/redeemableERC20/RedeemableERC20.sol/RedeemableERC20.json";
import ConfigurableRightsPoolJson from "@beehiveinnovation/configurable-rights-pool/artifacts/ConfigurableRightsPool.json";
import BPoolJson from "@beehiveinnovation/configurable-rights-pool/artifacts/BPool.json";

import {TrustFactory} from "@beehiveinnovation/rain-protocol/typechain/TrustFactory";
import {ReserveToken} from "@beehiveinnovation/rain-protocol/typechain/ReserveToken";
import {Trust} from "@beehiveinnovation/rain-protocol/typechain/Trust";
import {ITier} from "@beehiveinnovation/rain-protocol/typechain/ITier";
import {BFactory} from "@beehiveinnovation/rain-protocol/typechain/BFactory";
import {CRPFactory} from "@beehiveinnovation/rain-protocol/typechain/CRPFactory";
import {RedeemableERC20Factory} from "@beehiveinnovation/rain-protocol/typechain/RedeemableERC20Factory";
import {SeedERC20Factory} from "@beehiveinnovation/rain-protocol/typechain/SeedERC20Factory";
import { SeedERC20 } from "@beehiveinnovation/rain-protocol/typechain/SeedERC20";
import { RedeemableERC20 } from "@beehiveinnovation/rain-protocol/typechain/RedeemableERC20";
import { ConfigurableRightsPool } from "@beehiveinnovation/rain-protocol//typechain/ConfigurableRightsPool";
import { BPool } from "@beehiveinnovation/rain-protocol//typechain/BPool";
import { getContracts, getFactories, getTrust, NOTICE_QUERY, QUERY } from "./queries"
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { BigNumber,BigNumberish } from "ethers";
enum Tier {
  NIL,
  COPPER,
  BRONZE,
  SILVER,
  GOLD,
  PLATINUM,
  DIAMOND,
  CHAD,
  JAWAD,
}

enum DistributionStatus {
  Pending,
  Seeded,
  Trading,
  TradingCanEnd,
  Success,
  Fail
}

describe("Subgraph Test", function () {
    const subgraphUser = "vishalkale151071";
    const subgraphName = "rain-protocol";
    let trustFactory: TrustFactory;
    let reserve: ReserveToken
    let tier: ITier
    let minimumTier: Tier
    let subgraph: ApolloFetch
    let currentBlock: number
    let trust: Trust
    let crpFactory: CRPFactory
    let bFactory: BFactory
    let redeemableERC20Factory: RedeemableERC20Factory
    let seedERC20Factory: SeedERC20Factory
    let seederContract : SeedERC20

    let creator: SignerWithAddress
    let deployer: SignerWithAddress
    let seeder1: SignerWithAddress
    let seeder2: SignerWithAddress
    let signer1: SignerWithAddress

    before(async function (){

    const signers = await ethers.getSigners();

    // Signers (to avoid fetch again)
    creator = signers[0];
    deployer = signers[1]; // deployer is not creator
    seeder1 = signers[2];
    seeder2 = signers[3];
    signer1 = signers[4];

    [crpFactory, bFactory] = await Util.balancerDeploy(creator) as[CRPFactory, BFactory];

    reserve = (await Util.deploy(RESERVE_TOKEN, creator, [])) as ReserveToken

    tier = (await Util.deploy(READWRITE_TIER, creator, [])) as ITier;
    minimumTier = Tier.GOLD;
    // await tier.setTier(signer1.address, Tier.GOLD, []);

    ({ trustFactory, redeemableERC20Factory, seedERC20Factory} = await factoriesDeploy(crpFactory, bFactory, creator));
    currentBlock = await ethers.provider.getBlockNumber();

    console.log("Block: ", currentBlock--);

    console.log("trustF: ", trustFactory.address);

    const pathConfigLocal = path.resolve(__dirname, "../config/localhost.json");
    const configLocal = JSON.parse(Util.fetchFile(pathConfigLocal));

    configLocal.factory = trustFactory.address;
    configLocal.startBlock = currentBlock;
    Util.writeFile(pathConfigLocal, JSON.stringify(configLocal, null, 4));

    exec(`yarn deploy-build:localhost`);
    
    subgraph = fetchSubgraph(subgraphUser, subgraphName);
  })

  it("Should query the trust factories",async function(){
    await Util.delay(Util.wait)
    await waitForSubgraphToBeSynced(1000);

    const queryTrustCountresponse = (await subgraph({ query: QUERY })) as FetchResult;
    expect(queryTrustCountresponse.data.trustFactories[0].id).to.equals(trustFactory.address.toLowerCase())
    expect(queryTrustCountresponse.data.trustFactories[0].trustCount).to.equals('0')
  })

  it("Should get all the contracts from the Trust Construction Event", async function() {
    await Util.delay(Util.wait)
    await waitForSubgraphToBeSynced(1000)

    const queryResponse = await subgraph({query: getFactories(trustFactory.address.toLowerCase())})
    const factories = queryResponse.data.trustFactory
    
    expect(factories.balancerFactory).to.equals(bFactory.address.toLowerCase())
    expect(factories.crpFactory).to.equals(crpFactory.address.toLowerCase())
    expect(factories.redeemableERC20Factory).to.equals(redeemableERC20Factory.address.toLowerCase())
    expect(factories.seedERC20Factory).to.equals(seedERC20Factory.address.toLowerCase())
  })

  it("Should get a tier change correctly", async function(){
    const sender = creator.address;
    const accountToUpgrade = signer1.address;
    const startTier = await tier.report(accountToUpgrade);
    const endTier =  Tier.GOLD;

    await tier.setTier(accountToUpgrade, endTier, []);
    await Util.delay(Util.wait)
    await waitForSubgraphToBeSynced(1000);
    /**
     * Giving to `signer1` a tier (the beneficies)
     * The schema doesnt exit yet, but will be necessary here
     * In this case is a ReadWriteTier (ITier)
     * Need to be `setTier` before the Trust Creation
     * 
     */
  })

  describe("Single Trust test", function() {
    // Properties of this trust
    const erc20Config = { name: "Token", symbol: "TKN" };
    const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from("2000" + Util.eighteenZeros);
    const initialValuation = ethers.BigNumber.from("20000" + Util.sixZeros);
    const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
    const minimumTradingDuration = 20;

    // - Seeder props
    const seedERC20Config = { name: "SeedToken", symbol: "SDT" };
    const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
    const seederUnits = 10;
    const seederCooldownDuration = 1;
    const seedPrice = reserveInit.div(10);
    const minSeedUnits = 0;
    const seeder1Units = 4;
    const seeder2Units = 6;

    const successLevel = redeemInit
    .add(minimumCreatorRaise)
    .add(seederFee)
    .add(reserveInit);

    before("Create the trust", async function(){
      const trustFactoryDeployer = trustFactory.connect(deployer);

      trust = await Util.trustDeploy(
        trustFactoryDeployer,
        creator,
        {
          creator: creator.address,
          minimumCreatorRaise,
          seederFee,
          redeemInit,
          reserve: reserve.address,
          reserveInit,
          initialValuation,
          finalValuation: successLevel,
          minimumTradingDuration,
        },
        {
          erc20Config,
          tier: tier.address,
          minimumTier,
          totalSupply: totalTokenSupply,
        },
        {
          seeder: Util.zeroAddress,
          seederUnits,
          seederCooldownDuration,
          seedERC20Config,
        },
        { gasLimit: 15000000 }
      ) as Trust;
    })

    it("Should get the init trust state correctly", async function(){
      await Util.delay(Util.wait)
      await waitForSubgraphToBeSynced(2000);
       // Create Subgraph Connection
      const queryResponse = (await subgraph({ query: QUERY })) as FetchResult;
      const response = queryResponse.data 
      const factoryData = response.trustFactories[0]
      const trustData = factoryData.trusts[0]
      
      expect(parseInt(factoryData.trustCount)).to.equals(1)
      expect(trustData.id).to.equals(trust.address.toLowerCase())
      expect(trustData.factory).to.equals(trustFactory.address.toLowerCase())
      expect(trustData.trustParticipants).to.be.empty 
    })
  
    it("Contracts Test",async function(){
      await Util.delay(Util.wait)
      await waitForSubgraphToBeSynced(1000)
  
      const queryResponse = await subgraph({query: getContracts(trust.address.toLowerCase())})
      const contract = queryResponse.data.contract
      
      const gReserve = contract.reserveERC20
      expect(gReserve.name).to.equals(await reserve.name())
      expect(gReserve.symbol).to.equals(await reserve.symbol())
      expect(gReserve.decimals).to.equals(await reserve.decimals())
      expect(gReserve.totalSupply).to.equals(await reserve.totalSupply())
    })
  
    it("Should get the actual DistributionProgress", async function(){
      await Util.delay(Util.wait)
      await waitForSubgraphToBeSynced(1000)

      const distributionProgressQuery = `
        {
          distributionProgress(id: "${trust.address.toLowerCase()}"){
            distributionStatus
            minimumTradingDuration
            minimumCreatorRaise
            initialValuation
          }
        }
      `;
        
      const queryResponse = await subgraph({query: distributionProgressQuery})
      const distributionProgressData = queryResponse.data.distributionProgress;
      
       expect(distributionProgressData.distributionStatus).to.equals(DistributionStatus.Pending)
      /**
       * etc..
       * And we can add more queries because we already have the trust's properties in the describe scope
       */
    })
  
    it("Should get Notice correctly", async function(){
      const signers = await ethers.getSigners();
  
      const sender = signers[9];
  
      const noticeSender = trust.connect(sender)
  
      await noticeSender.sendNotice("0x01")
  
      await Util.delay(Util.wait)
      await waitForSubgraphToBeSynced(2000)
  
      let queryResponse = (await subgraph({ query: NOTICE_QUERY })) as FetchResult;
      let notices = queryResponse.data.notices
      expect(notices.length).to.equals(1)
      expect(notices[0].sender).to.equals(sender.address.toLowerCase())
      expect(notices[0].data).to.equals("0x01")
  
      queryResponse = (await subgraph({ query: getTrust(trust.address.toLowerCase()) })) as FetchResult;
      notices = queryResponse.data.trust.notices
      expect(notices.length).to.equals(1)
    })
  
    it("After a Seed event Test.", async function(){
      /*
        SeedERC20 Contact - When the `seed` funcion is called, the user who seed the contract
        with the reserves. will get some seed tokens. The event that is emitted:
  
        `emit Seed(msg.sender, units_, reserveAmount_);`
        - msg.sender - address that seed the contract
        - uint_ - the amount of seed tokens that sender will get by a `reserveAmount_`
        - reserverAmount - the amount sended to get the seed tokens
  
        After a seed, it is necessary get the amount of seed units and the amount of the reserve are availables in the contract.
        And the percent seeded. That means:
          The seeder1 will get an amount of seedUnits beetween `minSeedUnits` and `seeder1Units`, this depend of the stock of 
          SeedERC20 contract. In this case, will get `seeder1Units` because is full stock. So, seed uints available should be
          `seederUnits - seeder1Units` (10 - 4)
  
        Also, when a seed is call, a transfer of the Seed units (SeedERC20) happen, so maybe also would be good query the holders 
        Ofc, could be use the SeedERC20 with the first Seed event/entity
      */
  
      const { seeder } = await Util.getEventArgs(
        trust.deployTransaction,
        "Initialize",
        trust
      );
      seederContract = new ethers.Contract(
        seeder,
        seedERC20Json.abi,
        creator
      ) as SeedERC20;
  
      const recipient = trust.address;
  
      const reserveAmount = seedPrice.mul(seeder1Units);
  
      // seeder need some cash, give enough each for seeding
      await reserve.transfer(seeder1.address, reserveAmount);
      
      const seederContract1 = seederContract.connect(seeder1);
      const reserve1 = reserve.connect(seeder1);
      
      await reserve1.approve(seederContract.address, reserveAmount);
      
      // seeder send reserve to seeder contract
      await seederContract1.seed(minSeedUnits, seeder1Units);
  
      // Recipient gains infinite approval on reserve token withdrawals from seed contract
      await reserve.allowance(seederContract.address, recipient);
  
      // SeedERC20 queries :). As:
      await waitForSubgraphToBeSynced(1000);
      // - seedsUnits availables `seederUnitsAvail` (init: 10 units, now should 6), 
      // - reserve tokens in the seedContract `seededAmount`. This will be the `seedPrice * seedUnitsObtained`, 
      //   or `seederContract.seedPrice() * seedUnitsObtained`
      // etc
    });

    it("Should get the trustParticipant", async function () {
      await Util.delay(Util.wait)
      await waitForSubgraphToBeSynced(2000);
      const id = `${seeder1.address.toLowerCase()}-${trustFactory.address.toLowerCase()}`
      const trustParticipantQuery = `
      {
        trustParticipant(id: "${id}"){
          seeds{
            id
          }
        }
      }
    `;

       // Create Subgraph Connection
      const queryResponse = (await subgraph({ query: trustParticipantQuery })) as FetchResult;
      const trustParticipantData = queryResponse.data 

      // This user only have a single seed in this trust
      // expect(trustParticipantData.seeds.length).to.equals(1);
      // Or we can use the trustQuery and get the TrustParticipants lenght (should be one here)
    })
  
    it("After a second Seed event Test.", async function(){
      /*
        SeedERC20 Contact - When the `seed` funcion is called, the user who seed the contract
        with the reserves. will get some seed tokens. The event that is emitted:
  
        `emit Seed(msg.sender, units_, reserveAmount_);`
        - msg.sender - address that seed the contract
        - uint_ - the amount of seed tokens that sender will get by a `reserveAmount_`
        - reserverAmount - the amount sended to get the seed tokens
  
        In the second seed call, the seeder will seed and get the remain seed units `seeder2Units`. And seeds entity should
        be 2 of length
        It is necesarry check the again the `seederUnitsAvail`, `seededAmount` and `percentSeeded` if you like
      */
      const recipient = trust.address;
   
      // seeder need some cash, give enough each for seeding
      await reserve.transfer(seeder2.address, seedPrice.mul(seeder2Units));
      
      const seederContract2 = seederContract.connect(seeder2);
      const reserve2 = reserve.connect(seeder2);
      
      await reserve2.approve(seederContract.address, seedPrice.mul(seeder2Units));
      
      // seeders send reserve to seeder contract
      await seederContract2.seed(minSeedUnits, seeder2Units);
  
      // Recipient gains infinite approval on reserve token withdrawals from seed contract
      await reserve.allowance(seederContract.address, recipient);
  
      // Query the seedERC20 to see the new status ...
      await waitForSubgraphToBeSynced(1000);
    })
  
    it("Start Dutch Auction Test.", async function(){
  
      await trust.startDutchAuction();
  
      await waitForSubgraphToBeSynced(1000);
      /**
       * When startDutchAuction is called, a `StartDutchAuction(msg.sender, pool_, finalAuctionBlock_)` event is emitted.
       * From the DutchAuction entity could be query - The starterAddress
       */
    })
  
    it("Single Swap test", async function(){
      // Copy the properties of the trust. I think we should make a scope for this trust.
      const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
      
      const signers = await ethers.getSigners();
      const [crp, bPool] = await Util.poolContracts(signers, trust);
      
      const finalValuation = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
      const reserveSpend = finalValuation.div(10);
  
      // give signer some reserve
      await reserve.transfer(signer1.address, reserveSpend);
  
      const reserveSigner = reserve.connect(signer1);
      const crpSigner = crp.connect(signer1);
      const bPoolSigner = bPool.connect(signer1);
  
      await reserveSigner.approve(bPool.address, reserveSpend);
      await crpSigner.pokeWeights();
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        reserveSpend,
        await trust.token(),
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
      /**
       * Here is a single swap tx to query all the changes before and after the swap with the:
       * - Pool Entity with the numberOfSwaps, the contracts the poolBalanceReserve and the initial
       * poolTokenBalance (which is 10**18 * 10**9)
       * - Swap Entity can query the tokensIn and tokensOut
       * I think could use the balance of the user/contract to check the amount that out/in to their balances
       * and should match those differences with the out/in amount :) Also, the next `it` statement have a loop
       * to finish all the swaps. So, we can add these expects there
       */
       await waitForSubgraphToBeSynced(1500);
    })
  
    it("Swaps test", async function(){
      // Copy the properties of the trust. I think we should make a scope for this trust.
      const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
      const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
  
      const signers = await ethers.getSigners();
      const [crp, bPool] = await Util.poolContracts(signers, trust);
  
  
      const finalValuation = redeemInit
      .add(minimumCreatorRaise)
      .add(seederFee)
      .add(reserveInit);
      const reserveSpend = finalValuation.div(10);
  
      const swapReserveForTokens = async (signer: SignerWithAddress, spend: BigNumber) => {
        // give signer some reserve
        await reserve.transfer(signer.address, spend);
  
        const reserveSigner = reserve.connect(signer);
        const crpSigner = crp.connect(signer);
        const bPoolSigner = bPool.connect(signer);
  
        await reserveSigner.approve(bPool.address, spend);
        await crpSigner.pokeWeights();
        await bPoolSigner.swapExactAmountIn(
          reserve.address,
          spend,
          await trust.token(),
          ethers.BigNumber.from("1"),
          ethers.BigNumber.from("1000000" + Util.sixZeros)
        );
      };
      let swaps = 1;
      while ((await reserve.balanceOf(bPool.address)).lte(finalValuation)) {
        await swapReserveForTokens(signer1, reserveSpend);
        swaps++;
        /** 
         * Should query every swap here. All swaps will have the same. 
         * The `swaps` could be use to maintain control of the swaps lengths (in this scenario ofc)
         * Also check the amount in/out if it is necessary with the balances maybe
         */ 
      }
    })
  
    it("End Dutch Auction test", async function(){
      // Trust properties
      const seederFee = ethers.BigNumber.from("100" + Util.sixZeros);
      const redeemInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const reserveInit = ethers.BigNumber.from("2000" + Util.sixZeros);
      const minimumCreatorRaise = ethers.BigNumber.from("100" + Util.sixZeros);
      const minimumTradingDuration = 20;
      const finalValuation = redeemInit
        .add(minimumCreatorRaise)
        .add(seederFee)
        .add(reserveInit);
  
      await Util.createEmptyBlock(minimumTradingDuration);
  
      // Use `seeder1` to ends rase
      await trust.connect(seeder1).endDutchAuction();
  
      /**
       * `EndDutchAuction` Event/Entity
       * - `enderAddress`: Should be who call the endDutchAuction(), so eq to seeder1.address
       * - `finalBalance`: should be eq or greater than `finalValuation`
       * - `seederPay`: idk yet how this is calculated. Represent the payment of the seeder that will be approved
       * - `creatorPay`:
       * - `poolDust`: It is the reserver that still in the pool after end, `await reserve.balanceOf(poolAddress)`
       * - 
       * 
       */
       await waitForSubgraphToBeSynced(1500);
    })
  
    it("Trust Owner pulls reserve", async function(){
      await reserve
      .connect(creator)
      .transferFrom(
        trust.address,
        creator.address,
        await reserve.allowance(trust.address, creator.address)
      );
    })
  
    it("Seeder pull erc20", async function() {
        // seeder1 pulls erc20 from SeedERC20 contract
        await seederContract
        .connect(seeder1)
        .pullERC20(await reserve.allowance(trust.address, seederContract.address));
    })
  
    it("Redeem seed test", async function() {
      const seederContract1 = seederContract.connect(seeder1);
      const seeder1Units = 4
      await seederContract1.redeem(seeder1Units);
    })
  
    it("Pull ERC20 tokens ", async function() {
      const token = new ethers.Contract(
        await trust.token(),
        redeemableTokenJson.abi,
        creator
      ) as RedeemableERC20;
  
      await token
      .connect(signer1)
      .pullERC20(await reserve.allowance(trust.address, token.address));
    })
  
    it("Redeem RedeemableERC20 test", async function() {
      const token = new ethers.Contract(
        await trust.token(),
        redeemableTokenJson.abi,
        creator
      ) as RedeemableERC20;
  
      await token
        .connect(signer1)
        .redeem([reserve.address], await token.balanceOf(signer1.address));

        await waitForSubgraphToBeSynced(1500);
    })
  })


});
