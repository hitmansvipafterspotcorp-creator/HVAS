const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HitKoin", function () {
  async function deploy() {
    const [owner, minter, member1, member2, stranger] = await ethers.getSigners();
    const HitKoin = await ethers.getContractFactory("HitKoin");
    const token = await HitKoin.deploy(minter.address);
    await token.waitForDeployment();
    return { token, owner, minter, member1, member2, stranger };
  }

  it("names itself correctly", async function () {
    const { token } = await deploy();
    expect(await token.name()).to.equal("HitKoin");
    expect(await token.symbol()).to.equal("HITK");
  });

  it("lets the minter mint to a member", async function () {
    const { token, minter, member1 } = await deploy();
    await token.connect(minter).mint(member1.address, ethers.parseEther("50"));
    expect(await token.balanceOf(member1.address)).to.equal(ethers.parseEther("50"));
  });

  it("refuses minting from anyone except the minter", async function () {
    const { token, stranger, member1, owner } = await deploy();
    await expect(token.connect(stranger).mint(member1.address, 1)).to.be.revertedWithCustomError(token, "NotMinter");
    await expect(token.connect(owner).mint(member1.address, 1)).to.be.revertedWithCustomError(token, "NotMinter");
  });

  it("mints a whole bingo-night payout in one batch transaction", async function () {
    const { token, minter, member1, member2 } = await deploy();
    await token.connect(minter).mintBatch(
      [member1.address, member2.address],
      [ethers.parseEther("100"), ethers.parseEther("25")]
    );
    expect(await token.balanceOf(member1.address)).to.equal(ethers.parseEther("100"));
    expect(await token.balanceOf(member2.address)).to.equal(ethers.parseEther("25"));
  });

  it("lets the owner rotate the minter (key rotation, no redeploy)", async function () {
    const { token, owner, minter, member1, member2 } = await deploy();
    await token.connect(owner).setMinter(member2.address);
    await expect(token.connect(minter).mint(member1.address, 1)).to.be.revertedWithCustomError(token, "NotMinter");
    await token.connect(member2).mint(member1.address, ethers.parseEther("10"));
    expect(await token.balanceOf(member1.address)).to.equal(ethers.parseEther("10"));
  });

  it("refuses a non-owner rotating the minter", async function () {
    const { token, stranger, member1 } = await deploy();
    await expect(token.connect(stranger).setMinter(member1.address)).to.be.reverted;
  });

  it("members can spend/send HitKoin like any ERC-20 once they have it", async function () {
    const { token, minter, member1, member2 } = await deploy();
    await token.connect(minter).mint(member1.address, ethers.parseEther("30"));
    await token.connect(member1).transfer(member2.address, ethers.parseEther("12"));
    expect(await token.balanceOf(member1.address)).to.equal(ethers.parseEther("18"));
    expect(await token.balanceOf(member2.address)).to.equal(ethers.parseEther("12"));
  });
});
