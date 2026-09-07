import Image from 'next/image';

export function WechatContact() {
  return <figure className="wechat-contact">
    <a href="/wechat-contact.jpg" target="_blank" rel="noopener noreferrer" aria-label="打开管理员微信二维码大图">
      <Image src="/wechat-contact.jpg" alt="管理员微信二维码，扫码添加微信进行反馈或合作咨询" width={653} height={644} unoptimized />
    </a>
    <figcaption><span>扫描二维码，</span><span>添加管理员微信</span></figcaption>
  </figure>;
}
